/**
 * Presentation handler for POST /api/ml/import-pro/reset
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { createReadOnlyOrchestrator } from "../application/factory"
import { parseAccountIdFromBody } from "../application/request-parser"
import { ImportDomainError } from "../domain/errors"

export async function handleReset(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const accountId = parseAccountIdFromBody(body)

    const db = createAdminClient()
    const orchestrator = createReadOnlyOrchestrator(db)
    await orchestrator.resetProgress(accountId)

    return NextResponse.json({
      ok: true,
      message: "Import progress reset successfully",
    })
  } catch (error: unknown) {
    if (error instanceof ImportDomainError) {
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[IMPORT-PRO-RESET] Error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
