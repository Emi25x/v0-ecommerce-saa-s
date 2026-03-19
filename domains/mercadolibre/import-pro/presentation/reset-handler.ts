/**
 * Presentation handler for POST /api/ml/import-pro/reset
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { createLogger, generateRequestId } from "@/lib/observability/logger"
import { createReadOnlyOrchestrator } from "../application/factory"
import { parseAccountIdFromBody } from "../application/request-parser"
import { ImportDomainError } from "../domain/errors"

export async function handleReset(request: NextRequest): Promise<NextResponse> {
  const log = createLogger({ requestId: generateRequestId(), process: "import-pro.reset" })

  try {
    const body = await request.json()
    const accountId = parseAccountIdFromBody(body)

    log.info("reset_requested", { accountId })

    const db = createAdminClient()
    const orchestrator = createReadOnlyOrchestrator(db)
    await orchestrator.resetProgress(accountId)

    log.info("reset_completed", { accountId })

    return NextResponse.json({
      ok: true,
      message: "Import progress reset successfully",
    })
  } catch (error: unknown) {
    if (error instanceof ImportDomainError) {
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    log.error("reset_failed", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
