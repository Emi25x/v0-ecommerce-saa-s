/**
 * Presentation handler for POST /api/ml/import-pro/run
 *
 * Thin layer: parse → validate → orchestrate → respond.
 * All business logic lives in the orchestrator.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { protectAPI } from "@/lib/auth/protect-api"
import { createOrchestrator } from "../application/factory"
import { parseRunRequest } from "../application/request-parser"
import { ImportDomainError } from "../domain/errors"

export async function handleRun(request: NextRequest): Promise<NextResponse> {
  // Auth
  const authCheck = await protectAPI()
  if (authCheck.error) return authCheck.response

  let accountId: string | null = null

  try {
    // Parse
    const body = await request.json()
    const input = parseRunRequest(body)
    accountId = input.account_id

    // Build
    const db = createAdminClient()
    const orchestrator = await createOrchestrator(db, accountId)

    // Validate preconditions
    const { account, progress } = await orchestrator.validatePreconditions(accountId)

    // Execute
    const result = await orchestrator.run(account, progress, input)

    return NextResponse.json(result)
  } catch (error: unknown) {
    // Domain errors → structured response
    if (error instanceof ImportDomainError) {
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

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
