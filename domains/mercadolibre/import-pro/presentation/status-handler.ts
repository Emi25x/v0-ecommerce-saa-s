/**
 * Presentation handler for GET /api/ml/import-pro/status
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { createReadOnlyOrchestrator } from "../application/factory"
import { parseAccountIdFromQuery } from "../application/request-parser"
import { ImportDomainError } from "../domain/errors"

export async function handleStatus(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = parseAccountIdFromQuery(searchParams)

    const db = createAdminClient()
    const orchestrator = createReadOnlyOrchestrator(db)
    const result = await orchestrator.getStatus(accountId)

    return NextResponse.json(result)
  } catch (error: unknown) {
    if (error instanceof ImportDomainError) {
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[IMPORT-PRO] Status error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
