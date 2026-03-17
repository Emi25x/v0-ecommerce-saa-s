import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { executeIndexBatch } from "@/lib/ml/import-index-logic"

export const maxDuration = 60

/**
 * POST /api/ml/import/index
 * Phase A (Indexing): Fetches ML catalog and enqueues item IDs for processing.
 */
export async function POST(request: Request) {
  console.log("[v0] ========== ML IMPORT INDEX ==========")

  try {
    const supabase = await createClient()
    const { job_id, account_id, offset = 0 } = await request.json()

    if (!job_id || !account_id) {
      return NextResponse.json({ error: "job_id y account_id requeridos" }, { status: 400 })
    }

    const result = await executeIndexBatch(supabase, { job_id, account_id, offset })

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Index failed" }, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[v0] Error in index:", error)
    return NextResponse.json({ error: error.message || "Error desconocido en indexado" }, { status: 500 })
  }
}
