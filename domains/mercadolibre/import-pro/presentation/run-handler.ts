/**
 * Presentation handler for POST /api/ml/import-pro/run
 *
 * Thin layer: parse → validate → orchestrate → respond.
 * All business logic lives in the orchestrator.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { protectAPI } from "@/lib/auth/protect-api"
import { createStructuredLogger, genRequestId } from "@/lib/logger"
import { createOrchestrator } from "../application/factory"
import { parseRunRequest } from "../application/request-parser"
import { ImportDomainError } from "../domain/errors"

export async function handleRun(request: NextRequest): Promise<NextResponse> {
  const requestId = genRequestId()
  const log = createStructuredLogger({ request_id: requestId })

  // Auth
  const authCheck = await protectAPI()
  if (authCheck.error) {
    log.warn("Auth rejected", "auth.check", { status: "rejected" })
    return authCheck.response
  }

  let accountId: string | null = null

  try {
    // Parse
    const body = await request.json()
    const input = parseRunRequest(body)
    accountId = input.account_id

    const runLog = log.child({ account_id: accountId })
    runLog.info("Run request received", "import.run", {
      max_seconds: input.max_seconds,
      concurrency: input.concurrency,
      detail_batch: input.detail_batch,
      status: "accepted",
    })

    // Build — pass logger to factory so ML client gets it too
    const db = createAdminClient()
    const orchestrator = await createOrchestrator(db, accountId, runLog)

    // Validate preconditions
    const { account, progress } = await orchestrator.validatePreconditions(accountId)

    // Execute — orchestrator logs timing internally
    const result = await orchestrator.run(account, progress, input, runLog)

    return NextResponse.json(result)
  } catch (error: unknown) {
    // Domain errors → structured response
    if (error instanceof ImportDomainError) {
      log.warn("Domain error", "import.run", {
        error_code: error.code,
        account_id: accountId ?? undefined,
        status: "domain_error",
      })
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    log.error("Run failed", error, "import.run", {
      account_id: accountId ?? undefined,
    })

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
