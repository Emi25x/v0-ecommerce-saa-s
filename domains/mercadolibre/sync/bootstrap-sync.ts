/**
 * ML Account Bootstrap Sync
 *
 * When a new ML account is connected that already has publications,
 * this flow imports all existing items, extracts identifiers (SKU, GTIN, EAN),
 * upserts them into ml_publications, and runs the matcher to link them to products.
 *
 * Combines fetching logic from auto-sync.ts with enhanced identifier extraction
 * and the matcher from matcher.ts.
 */

import { getValidAccessToken } from "@/lib/mercadolibre"
import { runMatcherBatch } from "@/domains/mercadolibre/matcher"
import { createStructuredLogger, genRequestId } from "@/lib/logger"
import { startRun } from "@/lib/process-runs"
import type { SupabaseClient } from "@supabase/supabase-js"

// ── Types ────────────────────────────────────────────────────────────────────

export interface BootstrapSyncParams {
  accountId: string
  /** Limit items to fetch (0 = all) */
  limit?: number
  /** Only fetch, skip matching phase */
  skipMatching?: boolean
}

export interface BootstrapSyncResult {
  success: boolean
  phase: "fetch" | "match" | "complete"
  fetch: {
    total_in_ml: number
    fetched: number
    upserted: number
    errors: number
    statuses: Record<string, number>
  }
  match: {
    matched: number
    ambiguous: number
    not_found: number
    invalid: number
    total_processed: number
    is_complete: boolean
  }
  run_id: string
  error?: string
}

interface MlItemAttributes {
  id: string
  value_name?: string | null
}

const BATCH_SIZE = 50
const DELAY_BETWEEN_BATCHES_MS = 1200

// ── Main ─────────────────────────────────────────────────────────────────────

export async function executeBootstrapSync(
  supabase: SupabaseClient,
  params: BootstrapSyncParams,
): Promise<BootstrapSyncResult> {
  const { accountId, limit = 0, skipMatching = false } = params
  const requestId = genRequestId()
  const log = createStructuredLogger({ request_id: requestId, account_id: accountId })

  const run = await startRun(supabase, "ml_bootstrap_sync", `Bootstrap Sync ML Account`)

  const result: BootstrapSyncResult = {
    success: false,
    phase: "fetch",
    fetch: { total_in_ml: 0, fetched: 0, upserted: 0, errors: 0, statuses: {} },
    match: { matched: 0, ambiguous: 0, not_found: 0, invalid: 0, total_processed: 0, is_complete: false },
    run_id: run.id,
  }

  try {
    // ── 1. Get account ────────────────────────────────────────────────────
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, nickname, access_token")
      .eq("id", accountId)
      .single()

    if (!account) {
      result.error = "Account not found"
      await run.fail(new Error(result.error))
      return result
    }

    // Refresh token
    const accessToken = await getValidAccessToken(accountId)

    log.info("Bootstrap sync started", "ml.bootstrap_sync.start", {
      ml_user_id: account.ml_user_id,
      nickname: account.nickname,
      limit: limit || "all",
    })

    // ── 2. Fetch phase: get ALL items from ML ─────────────────────────────
    let offset = 0
    let totalInMl = 0
    let fetched = 0
    let upserted = 0
    let fetchErrors = 0
    const statuses: Record<string, number> = {}

    // Fetch across all statuses (active, paused, closed)
    for (const status of ["active", "paused", "closed"]) {
      let statusOffset = 0
      let hasMore = true

      while (hasMore) {
        if (limit > 0 && fetched >= limit) {
          hasMore = false
          break
        }

        const searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=${status}&limit=${BATCH_SIZE}&offset=${statusOffset}`
        const searchRes = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (!searchRes.ok) {
          if (searchRes.status === 429) {
            log.warn("Rate limited during fetch", "ml.bootstrap_sync.rate_limit", { status, offset: statusOffset })
            await sleep(5000)
            continue
          }
          log.error("ML search API error", new Error(`HTTP ${searchRes.status}`), "ml.bootstrap_sync.search_error", {
            status,
            offset: statusOffset,
          })
          fetchErrors++
          break
        }

        const searchData = await searchRes.json()
        const itemIds: string[] = searchData.results || []
        const pagingTotal = searchData.paging?.total || 0

        if (status === "active" && statusOffset === 0) {
          totalInMl = pagingTotal
        }
        statuses[status] = pagingTotal

        if (itemIds.length === 0) {
          hasMore = false
          break
        }

        // Fetch item details in chunks of 20 (ML multiget)
        for (let i = 0; i < itemIds.length; i += 20) {
          const chunk = itemIds.slice(i, i + 20)
          const multigetUrl = `https://api.mercadolibre.com/items?ids=${chunk.join(",")}&attributes=id,title,price,available_quantity,status,permalink,seller_custom_field,attributes,catalog_product_id`
          const multigetRes = await fetch(multigetUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })

          if (!multigetRes.ok) {
            fetchErrors += chunk.length
            continue
          }

          const multigetData = await multigetRes.json()

          const upsertRows: any[] = []
          for (const entry of multigetData) {
            if (entry.code !== 200 || !entry.body) {
              fetchErrors++
              continue
            }

            const item = entry.body
            fetched++

            // Extract identifiers
            const { sku, ean, gtin, isbn } = extractIdentifiers(item)

            upsertRows.push({
              account_id: accountId,
              ml_item_id: item.id,
              product_id: null, // Will be matched later
              title: item.title,
              price: item.price,
              current_stock: item.available_quantity,
              status: item.status,
              permalink: item.permalink,
              sku: sku || null,
              ean: ean || null,
              gtin: gtin || null,
              isbn: isbn || null,
              catalog_product_id: item.catalog_product_id || null,
              updated_at: new Date().toISOString(),
            })
          }

          // Upsert batch — preserve existing product_id if already matched
          if (upsertRows.length > 0) {
            const { error: upsertError } = await supabase.from("ml_publications").upsert(upsertRows, {
              onConflict: "account_id,ml_item_id",
              ignoreDuplicates: false,
            })

            if (upsertError) {
              log.error("Upsert error", upsertError, "ml.bootstrap_sync.upsert_error")
              fetchErrors += upsertRows.length
            } else {
              upserted += upsertRows.length
            }
          }
        }

        statusOffset += itemIds.length
        hasMore = statusOffset < pagingTotal && (limit === 0 || fetched < limit)

        // Checkpoint every 200 items
        if (fetched % 200 < BATCH_SIZE) {
          await run.checkpoint({
            rows_processed: fetched,
            rows_created: upserted,
            rows_failed: fetchErrors,
            log_json: { phase: "fetch", statuses },
          })
        }

        await sleep(DELAY_BETWEEN_BATCHES_MS)
      }
    }

    result.fetch = {
      total_in_ml: Object.values(statuses).reduce((a, b) => a + b, 0),
      fetched,
      upserted,
      errors: fetchErrors,
      statuses,
    }

    log.info("Fetch phase complete", "ml.bootstrap_sync.fetch_complete", {
      ...result.fetch,
    })

    // ── 3. Match phase ────────────────────────────────────────────────────
    result.phase = "match"

    if (skipMatching) {
      log.info("Matching skipped by request", "ml.bootstrap_sync.match_skip")
    } else {
      // Run matcher in batches until complete
      let matchComplete = false
      let matchRounds = 0
      const MAX_MATCH_ROUNDS = 50 // safety limit

      while (!matchComplete && matchRounds < MAX_MATCH_ROUNDS) {
        matchRounds++

        const matchResult = await runMatcherBatch(supabase, supabase, {
          account_id: accountId,
          max_seconds: 25,
          batch_size: 500,
          reset: matchRounds === 1, // reset on first round
        })

        result.match = {
          matched: matchResult.matched + (result.match.matched || 0),
          ambiguous: matchResult.ambiguous + (result.match.ambiguous || 0),
          not_found: matchResult.not_found + (result.match.not_found || 0),
          invalid: matchResult.invalid + (result.match.invalid || 0),
          total_processed: matchResult.total_processed,
          is_complete: matchResult.is_complete,
        }

        matchComplete = matchResult.is_complete || matchResult.status === "no_work"

        if (!matchComplete) {
          await sleep(500)
        }
      }

      log.info("Match phase complete", "ml.bootstrap_sync.match_complete", {
        rounds: matchRounds,
        ...result.match,
      })
    }

    // ── 4. Update account stats ───────────────────────────────────────────
    await supabase
      .from("ml_accounts")
      .update({
        last_stock_sync_at: new Date().toISOString(),
        total_ml_publications: result.fetch.total_in_ml,
      })
      .eq("id", accountId)

    // ── 5. Finalize ───────────────────────────────────────────────────────
    result.phase = "complete"
    result.success = true

    await run.complete({
      rows_processed: fetched,
      rows_created: upserted,
      rows_updated: result.match.matched,
      rows_failed: fetchErrors + result.match.not_found,
      log_json: {
        fetch: result.fetch,
        match: result.match,
        account_id: accountId,
        nickname: account.nickname,
      },
    })

    log.info("Bootstrap sync completed", "ml.bootstrap_sync.complete", {
      fetched,
      upserted,
      matched: result.match.matched,
      not_found: result.match.not_found,
    })

    return result
  } catch (err: any) {
    log.error("Bootstrap sync failed", err, "ml.bootstrap_sync.error")
    await run.fail(err)
    result.error = err.message ?? "Unknown error"
    return result
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract SKU, EAN, GTIN, ISBN from ML item attributes */
function extractIdentifiers(item: any): {
  sku: string | null
  ean: string | null
  gtin: string | null
  isbn: string | null
} {
  let sku = item.seller_custom_field || null
  let ean: string | null = null
  let gtin: string | null = null
  let isbn: string | null = null

  if (item.attributes && Array.isArray(item.attributes)) {
    for (const attr of item.attributes as MlItemAttributes[]) {
      const val = attr.value_name?.trim()
      if (!val) continue

      switch (attr.id) {
        case "SELLER_SKU":
          if (!sku) sku = val
          break
        case "GTIN":
          gtin = val
          // GTIN-13 is usually also EAN
          if (val.length === 13 && !ean) ean = val
          break
        case "EAN":
          ean = val
          break
        case "ISBN":
          isbn = val
          break
        case "MPN":
          // Manufacturer part number can sometimes be an EAN
          if (/^\d{13}$/.test(val) && !ean) ean = val
          break
      }
    }
  }

  return { sku, ean, gtin, isbn }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
