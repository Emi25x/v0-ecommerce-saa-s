/**
 * Presentation handler for POST /api/ml/import-pro/reset
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { createStructuredLogger, genRequestId } from "@/lib/logger"
import { createReadOnlyOrchestrator } from "../application/factory"
import { parseAccountIdFromBody } from "../application/request-parser"
import { ImportDomainError } from "../domain/errors"

export async function handleReset(request: NextRequest): Promise<NextResponse> {
  const log = createStructuredLogger({ request_id: genRequestId() })

  try {
    const body = await request.json()
    const accountId = parseAccountIdFromBody(body)

    log.info("Reset requested", "import.reset", {
      account_id: accountId,
      status: "started",
    })

    const db = createAdminClient()
    const orchestrator = createReadOnlyOrchestrator(db)
    await orchestrator.resetProgress(accountId)

    log.info("Reset completed", "import.reset", {
      account_id: accountId,
      status: "ok",
    })

    return NextResponse.json({
      ok: true,
      message: "Import progress reset successfully",
    })
  } catch (error: unknown) {
    if (error instanceof ImportDomainError) {
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    log.error("Reset failed", error, "import.reset")
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
