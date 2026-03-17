import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { executeWorkerBatch } from "@/lib/ml/import-worker-logic"

export const maxDuration = 60

/**
 * POST /api/ml/import/worker
 * Phase B (Worker): Processes small batches of pending items.
 * Uses ML multiget to fetch details, extracts SKU/GTIN, and links to products.
 */
export async function POST(request: Request) {
  console.log("[v0] ========== ML IMPORT WORKER ==========")

  try {
    const supabase = await createClient()
    const { job_id, batch_size = 20 } = await request.json()

    if (!job_id) {
      return NextResponse.json({ error: "job_id requerido" }, { status: 400 })
    }

    const result = await executeWorkerBatch(supabase, { job_id, batch_size })

    if (result.error && !result.success) {
      const status = result.error === "Job not found" ? 404
        : result.error === "Error claiming items" ? 500
        : result.error === "Rate limit" ? 429
        : 500
      return NextResponse.json(result, { status })
    }

    console.log("[v0] Worker completed:", { processed: result.processed, failed: result.failed, linked: result.linked, unmatched: result.unmatched })
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[v0] Error in worker:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
