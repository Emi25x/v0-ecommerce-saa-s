/**
 * Presentation handler for POST /api/ml/import-pro/run
 *
 * Thin layer: parse → validate → orchestrate → respond.
 * All business logic lives in the orchestrator.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { protectAPI } from "@/lib/auth/protect-api"
import { createLogger, generateRequestId } from "@/lib/observability/logger"
import { createOrchestrator } from "../application/factory"
import { parseRunRequest } from "../application/request-parser"
import { ImportDomainError } from "../domain/errors"

export async function handleRun(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId()
  const log = createLogger({ requestId, process: "import-pro.run" })

  // Auth
  const authCheck = await protectAPI()
  if (authCheck.error) {
    log.warn("auth_rejected")
    return authCheck.response
  }

  let accountId: string | null = null

  try {
    // Parse
    const body = await request.json()
    const input = parseRunRequest(body)
    accountId = input.account_id

    const runLog = log.child({ accountId })
    runLog.info("run_started", {
      maxSeconds: input.max_seconds,
      concurrency: input.concurrency,
      detailBatch: input.detail_batch,
    })

    // Build
    const db = createAdminClient()
    const orchestrator = await createOrchestrator(db, accountId)

    // Validate preconditions
    const { account, progress } = await orchestrator.validatePreconditions(accountId)

    // Execute
    const result = await orchestrator.run(account, progress, input, runLog)

    runLog.info("run_completed", {
      importedCount: result.imported_count,
      mlItemsSeen: result.ml_items_seen_count,
      dbRowsUpserted: result.db_rows_upserted,
      errorsCount: result.errors_count,
      elapsedMs: result.elapsed_ms,
      hasMore: result.has_more,
      rateLimited: result.rate_limited,
    })

    return NextResponse.json(result)
  } catch (error: unknown) {
    // Domain errors → structured response
    if (error instanceof ImportDomainError) {
      log.warn("domain_error", { code: error.code, accountId: accountId ?? undefined })
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    log.error("run_failed", error, { accountId: accountId ?? undefined })

    // Cleanup on unexpected errors
    if (accountId) {
      try {
        const db = createAdminClient()
        const { createReadOnlyOrchestrator } = await import("../application/factory")
        const orchestrator = createReadOnlyOrchestrator(db)
        await orchestrator.handleError(accountId, error)
      } catch {
        /* best-effort */
      }
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
