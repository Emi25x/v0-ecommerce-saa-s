/**
 * Import Orchestrator
 *
 * Core business logic for the ML Import Pro scan+multiget loop.
 * Depends ONLY on interfaces — no direct Supabase or HTTP calls.
 *
 * Responsibilities:
 * - Validate preconditions (account, progress, concurrency guard)
 * - Drive the time-bounded scan loop
 * - Coordinate multiget hydration via concurrency pool
 * - Map raw items to publication rows
 * - Persist via repositories
 * - Track audit counters
 * - Handle scroll expiration and completion detection
 * - Structured logging with per-operation timing
 */

import type {
  IMercadoLibreClient,
  IImportProgressRepository,
  IPublicationRepository,
  IMlAccountRepository,
  IImportRunLogger,
  IRunHandle,
} from "../infrastructure/interfaces"

import type {
  ImportRunInput,
  ImportRunResult,
  ImportProgress,
  MlAccount,
  MlRawItem,
} from "../domain/types"

import type { StructuredLogger } from "@/lib/logger"
import { measure } from "@/lib/logger"

import {
  ML_MULTIGET_MAX_IDS,
  CONCURRENCY_STALE_THRESHOLD_MS,
  SCROLL_COVERAGE_THRESHOLD,
  UPSERT_HEALTH_THRESHOLD,
  MAX_CONSECUTIVE_EMPTY_SCANS,
} from "../domain/types"

import {
  AccountNotFoundError,
  ProgressNotFoundError,
  ConcurrentRunError,
  RateLimitedError,
  DatabaseError,
} from "../domain/errors"

import { mapItemsToPublications } from "../domain/publication-mapper"
import { runPool } from "./concurrency-pool"

export class ImportOrchestrator {
  constructor(
    private readonly mlClient: IMercadoLibreClient,
    private readonly progressRepo: IImportProgressRepository,
    private readonly publicationRepo: IPublicationRepository,
    private readonly accountRepo: IMlAccountRepository,
    private readonly runLogger: IImportRunLogger,
  ) {}

  // ── Validate Preconditions ──────────────────────────────────────────────

  async validatePreconditions(
    accountId: string,
  ): Promise<{ account: MlAccount; progress: ImportProgress }> {
    // Account exists?
    const account = await this.accountRepo.findById(accountId)
    if (!account) throw new AccountNotFoundError(accountId)

    // Progress exists?
    const progress = await this.progressRepo.get(accountId)
    if (!progress) throw new ProgressNotFoundError(accountId)

    // Concurrency guard: reject if another run is active and recent
    if (progress.status === "running" && progress.last_run_at) {
      const elapsed = Date.now() - new Date(progress.last_run_at).getTime()
      if (elapsed < CONCURRENCY_STALE_THRESHOLD_MS) {
        throw new ConcurrentRunError(accountId, CONCURRENCY_STALE_THRESHOLD_MS - elapsed)
      }
    }

    // Rate limit pause check
    if (progress.status === "paused" && progress.paused_until) {
      if (new Date(progress.paused_until) > new Date()) {
        const waitSeconds = Math.ceil(
          (new Date(progress.paused_until).getTime() - Date.now()) / 1000,
        )
        throw new RateLimitedError(accountId, waitSeconds)
      }
      // Pause expired — unlock
      await this.progressRepo.update(accountId, { status: "idle", paused_until: null })
    }

    return { account, progress }
  }

  // ── Run Import Loop ─────────────────────────────────────────────────────

  async run(
    account: MlAccount,
    progress: ImportProgress,
    input: ImportRunInput,
    log?: StructuredLogger,
  ): Promise<ImportRunResult> {
    const runStart = performance.now()
    const startTime = Date.now()
    const accountId = input.account_id
    const maxMs = (input.max_seconds ?? 12) * 1000
    const batchSize = Math.min(ML_MULTIGET_MAX_IDS, input.detail_batch ?? ML_MULTIGET_MAX_IDS)
    const concurrency = input.concurrency ?? 2

    // Mark as running
    await this.progressRepo.update(accountId, {
      status: "running",
      last_run_at: new Date().toISOString(),
      last_error: null,
    })

    // Start audit trail
    const runHandle = await this.runLogger.start()
    log?.info("Import run started", "import.run", {
      max_ms: maxMs,
      batch_size: batchSize,
      concurrency,
      status: "started",
    })

    let importedCount = 0
    let mlSeenCount = 0
    let errorsCount = 0
    let rateLimited = false
    let hasMore = true
    let consecutiveZeroScans = 0
    let loopIteration = 0

    // Cumulative timing
    let totalScanMs = 0
    let totalMultigetMs = 0
    let totalUpsertMs = 0

    try {
      // ── Time-bounded scan loop ──────────────────────────────────────────
      while (Date.now() - startTime < maxMs) {
        loopIteration++

        // Reload progress for current scroll position
        const cur = await this.progressRepo.get(accountId)
        if (!cur) break

        const scrollId = cur.scroll_id
        const offset = cur.publications_offset

        // ── Step 1: Scan for item IDs (TIMED) ────────────────────────────
        let scanPage
        try {
          const scanResult = await measure(() =>
            this.mlClient.scanItems(
              account.ml_user_id,
              scrollId,
              (progress.publications_scope || "all") as "all" | "active_only",
            ),
          )
          scanPage = scanResult.result
          totalScanMs += scanResult.duration_ms
        } catch (err: unknown) {
          errorsCount++
          log?.error("Scan failed", err, "ml.scan", {
            offset,
            iteration: loopIteration,
          })
          const errMsg = err instanceof Error ? err.message : String(err)
          await this.progressRepo.update(accountId, {
            last_error: `Scan failed: ${errMsg.slice(0, 300)}`,
            last_error_at: new Date().toISOString(),
          })
          break
        }

        // Rate limited by ML
        if (scanPage.item_ids.length === 0 && scanPage.total === 0 && !scrollId) {
          log?.warn("Possible rate limit or empty account", "ml.scan", {
            status: "rate_limited",
            total: scanPage.total,
          })
        }

        mlSeenCount += scanPage.item_ids.length

        // ── Empty results handling ────────────────────────────────────────
        if (scanPage.item_ids.length === 0) {
          consecutiveZeroScans++

          if (consecutiveZeroScans >= MAX_CONSECUTIVE_EMPTY_SCANS) {
            log?.warn("Consecutive empty scans limit reached", "import.scan_loop", {
              consecutive_zero_scans: consecutiveZeroScans,
              status: "cursor_reset",
            })
            await this.progressRepo.update(accountId, {
              status: "idle",
              scroll_id: null,
              publications_offset: 0,
              ml_items_seen_count: 0,
              last_error:
                "3 scans consecutivos sin items: cursor reiniciado — items en DB preservados.",
              last_error_at: new Date().toISOString(),
            })
            break
          }

          // Check for scroll expiration vs genuine completion
          const result = await this.handleScanComplete(
            accountId,
            scanPage.total,
            runHandle,
            log,
          )
          hasMore = result.hasMore
          break
        }

        consecutiveZeroScans = 0

        // Save new scroll_id immediately
        if (scanPage.scroll_id && scanPage.scroll_id !== scrollId) {
          await this.progressRepo.update(accountId, { scroll_id: scanPage.scroll_id })
        }

        // Fix publications_total on first page only
        if (!scrollId && scanPage.total > 0) {
          log?.info("Publications total discovered", "import.scan_loop", {
            total: scanPage.total,
          })
          await this.progressRepo.update(accountId, { publications_total: scanPage.total })
        }

        // ── Step 2: Hydrate items via multiget (TIMED) ────────────────────
        const batches = this.chunkArray(scanPage.item_ids, batchSize)
        const multigetTasks = batches.map(
          (batch) => () => this.mlClient.getItemDetails(batch),
        )
        const multigetResult = await measure(() => runPool(multigetTasks, concurrency))
        totalMultigetMs += multigetResult.duration_ms
        const multigetResults = multigetResult.result

        // ── Step 3: Map to publication rows ──────────────────────────────
        const allItems: MlRawItem[] = []
        let multigetErrors = 0
        for (const result of multigetResults) {
          if (result.status === "fulfilled") {
            allItems.push(...result.value)
          } else {
            errorsCount++
            multigetErrors++
          }
        }

        if (multigetErrors > 0) {
          log?.warn("Multiget partial failure", "ml.multiget", {
            status: "partial",
            errors: multigetErrors,
            batch_count: batches.length,
          })
        }

        const now = new Date().toISOString()
        const toUpsert = mapItemsToPublications(allItems, accountId, now)

        // ── Step 4: Persist (TIMED) ─────────────────────────────────────
        let batchUpserted = 0

        if (toUpsert.length > 0) {
          const upsertResult = await measure(() => this.publicationRepo.upsert(toUpsert))
          totalUpsertMs += upsertResult.duration_ms
          const { count, error } = upsertResult.result

          if (error) {
            errorsCount += toUpsert.length
            log?.error("Upsert failed", new Error(error), "db.upsert", {
              duration_ms: upsertResult.duration_ms,
              row_count: toUpsert.length,
            })
            await this.progressRepo.update(accountId, {
              last_error: `Upsert failed (${toUpsert.length} rows): ${error}`,
              last_error_at: now,
            })
          } else {
            batchUpserted = count
            importedCount += batchUpserted

            if (count < toUpsert.length) {
              errorsCount += toUpsert.length - count
              log?.warn("Upsert partial", "db.upsert", {
                duration_ms: upsertResult.duration_ms,
                status: "partial",
                expected: toUpsert.length,
                actual: count,
              })
            } else {
              log?.info("Upsert completed", "db.upsert", {
                duration_ms: upsertResult.duration_ms,
                status: "ok",
                rows: batchUpserted,
              })
            }
          }
        }

        log?.info("Scan iteration completed", "import.scan_loop", {
          iteration: loopIteration,
          scanned: scanPage.item_ids.length,
          hydrated: allItems.length,
          upserted: batchUpserted,
          offset: offset + scanPage.item_ids.length,
          elapsed_ms: Date.now() - startTime,
          status: "ok",
        })

        // ── Step 5: Update counters ─────────────────────────────────────
        await this.incrementCounters(accountId, {
          itemsScanned: scanPage.item_ids.length,
          itemsFetched: toUpsert.length,
          itemsUpserted: batchUpserted,
          upsertErrors: Math.max(0, toUpsert.length - batchUpserted),
          offset: offset + scanPage.item_ids.length,
          clearError: batchUpserted > 0 && toUpsert.length - batchUpserted === 0,
        })

        if (rateLimited) break
        if (Date.now() - startTime >= maxMs) break
      }
    } catch (err: unknown) {
      // Unexpected error — mark as error and let the caller handle
      log?.error("Scan loop crashed", err, "import.run", {
        iteration: loopIteration,
        status: "crashed",
      })
      const msg = err instanceof Error ? err.message : String(err)
      await this.progressRepo.update(accountId, {
        status: "failed",
        last_error: msg,
        last_error_at: new Date().toISOString(),
      })
      await runHandle.fail(err)
      throw err
    }

    // ── Finalize ──────────────────────────────────────────────────────────
    const finalProgress = await this.progressRepo.get(accountId)
    const isDone = finalProgress?.status === "done"

    // Mark idle if not done/paused
    if (!isDone && !rateLimited && finalProgress?.status === "running") {
      await this.progressRepo.update(accountId, { status: "idle" })
    }

    const totalDurationMs = Math.round(performance.now() - runStart)

    // Complete audit trail
    await runHandle.complete({
      rows_processed: mlSeenCount,
      rows_updated: importedCount,
      rows_failed: errorsCount,
      log_json: {
        account_id: accountId,
        ml_seen: mlSeenCount,
        db_upserted: importedCount,
        errors: errorsCount,
        rate_limited: rateLimited,
        has_more: hasMore && !isDone,
        total_seen: finalProgress?.ml_items_seen_count ?? 0,
        total_upserted: finalProgress?.db_rows_upserted_count ?? 0,
        ml_total: finalProgress?.publications_total ?? 0,
        timing: {
          total_ms: totalDurationMs,
          scan_ms: totalScanMs,
          multiget_ms: totalMultigetMs,
          upsert_ms: totalUpsertMs,
        },
      },
    })

    log?.info("Import run completed", "import.run", {
      status: isDone ? "done" : hasMore ? "has_more" : "idle",
      duration_ms: totalDurationMs,
      iterations: loopIteration,
      imported: importedCount,
      ml_seen: mlSeenCount,
      errors: errorsCount,
      rate_limited: rateLimited,
      timing_scan_ms: totalScanMs,
      timing_multiget_ms: totalMultigetMs,
      timing_upsert_ms: totalUpsertMs,
    })

    return {
      ok: true,
      imported_count: importedCount,
      ml_items_seen_count: mlSeenCount,
      db_rows_upserted: importedCount,
      total_seen: finalProgress?.ml_items_seen_count ?? 0,
      total_upserted: finalProgress?.db_rows_upserted_count ?? 0,
      total_upsert_errors: finalProgress?.upsert_errors_count ?? 0,
      ml_total: finalProgress?.publications_total ?? 0,
      db_gap: (finalProgress?.publications_total ?? 0) - (finalProgress?.db_rows_upserted_count ?? 0),
      elapsed_ms: totalDurationMs,
      has_more: hasMore && !isDone,
      last_scroll_id: finalProgress?.scroll_id ?? null,
      errors_count: errorsCount,
      rate_limited: rateLimited,
    }
  }

  // ── Get Status ──────────────────────────────────────────────────────────

  async getStatus(accountId: string) {
    const account = await this.accountRepo.findById(accountId)
    if (!account) throw new AccountNotFoundError(accountId)

    const progress = await this.progressRepo.getOrCreate(accountId)
    const publicationsInDb = await this.publicationRepo.countByAccount(accountId)

    const publicationsProgress =
      progress.publications_total && progress.publications_total > 0
        ? Math.min(100, Math.round((progress.publications_offset / progress.publications_total) * 100))
        : 0

    return {
      ok: true as const,
      account: { id: account.id, nickname: account.nickname },
      progress: {
        ...progress,
        publications_progress: publicationsProgress,
        publications_in_db: publicationsInDb,
      },
    }
  }

  // ── Reset ───────────────────────────────────────────────────────────────

  async resetProgress(accountId: string): Promise<void> {
    const account = await this.accountRepo.findById(accountId)
    if (!account) throw new AccountNotFoundError(accountId)

    await this.progressRepo.reset(accountId)
  }

  // ── Handle Error (cleanup) ──────────────────────────────────────────────

  async handleError(accountId: string, error: unknown): Promise<void> {
    try {
      const msg = error instanceof Error ? error.message : String(error)
      await this.progressRepo.update(accountId, {
        status: "failed",
        last_error: msg,
      })
    } catch {
      /* best-effort */
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async handleScanComplete(
    accountId: string,
    totalFromApi: number,
    _runHandle: IRunHandle,
    log?: StructuredLogger,
  ): Promise<{ hasMore: boolean }> {
    const progress = await this.progressRepo.get(accountId)
    if (!progress) return { hasMore: false }

    const totalSeen = progress.ml_items_seen_count
    const totalUpserted = progress.db_rows_upserted_count
    const mlTotal = progress.publications_total ?? totalFromApi ?? 0

    // Ensure publications_total is set
    if (!progress.publications_total && totalFromApi > 0) {
      await this.progressRepo.update(accountId, { publications_total: totalFromApi })
    }

    // Detect scroll expiration
    const pctCovered = mlTotal > 0 ? totalSeen / mlTotal : 1
    const scrollExpired = mlTotal > 0 && pctCovered < SCROLL_COVERAGE_THRESHOLD

    if (scrollExpired) {
      log?.warn("Scroll expired, resetting cursor", "import.scroll", {
        status: "scroll_expired",
        pct_covered: Math.round(pctCovered * 100),
        total_seen: totalSeen,
        ml_total: mlTotal,
      })
      await this.progressRepo.update(accountId, {
        status: "idle",
        scroll_id: null,
        publications_offset: 0,
        ml_items_seen_count: 0,
        last_error: `Scroll ML expirado al ${Math.round(pctCovered * 100)}% (${totalSeen}/${mlTotal} vistos). Reiniciando scan — items ya importados permanecen en DB.`,
        last_error_at: new Date().toISOString(),
      })
      return { hasMore: true }
    }

    // Scan complete
    const upsertHealthy = totalSeen === 0 || totalUpserted / totalSeen >= UPSERT_HEALTH_THRESHOLD
    const finalStatus = upsertHealthy ? "done" : "scan_complete_pending_verification"

    log?.info("Scan complete", "import.scan_loop", {
      status: finalStatus,
      total_seen: totalSeen,
      total_upserted: totalUpserted,
      ml_total: mlTotal,
      upsert_healthy: upsertHealthy,
    })

    await this.progressRepo.update(accountId, {
      status: finalStatus,
      scroll_id: null,
      finished_at: new Date().toISOString(),
      last_error: null,
    })

    return { hasMore: false }
  }

  private async incrementCounters(
    accountId: string,
    batch: {
      itemsScanned: number
      itemsFetched: number
      itemsUpserted: number
      upsertErrors: number
      offset: number
      clearError: boolean
    },
  ): Promise<void> {
    const counters = await this.progressRepo.getCounters(accountId)
    if (!counters) return

    const update: Partial<ImportProgress> = {
      publications_offset: batch.offset,
      upsert_new_count: (counters.upsert_new_count ?? 0) + batch.itemsUpserted,
      fetched_count: (counters.fetched_count ?? 0) + batch.itemsFetched,
      discovered_count: (counters.discovered_count ?? 0) + batch.itemsScanned,
      request_count: (counters.request_count ?? 0) + 1,
      ml_items_seen_count: (counters.ml_items_seen_count ?? 0) + batch.itemsScanned,
      db_rows_upserted_count: (counters.db_rows_upserted_count ?? 0) + batch.itemsUpserted,
      upsert_errors_count: (counters.upsert_errors_count ?? 0) + batch.upsertErrors,
      last_sync_batch_at: new Date().toISOString(),
    }

    if (batch.clearError) {
      update.last_error = null
      update.last_error_at = null
    }

    await this.progressRepo.update(accountId, update)
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size))
    }
    return chunks
  }
}
