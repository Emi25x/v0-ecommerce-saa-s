import { createClient } from "@/lib/db/server"
import { executeSyncOrdersBatch } from "@/domains/mercadolibre/sync/orders"
import { NextRequest, NextResponse } from "next/server"

export const dynamic    = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/ml/sync-orders
 * Body: { account_id, offset?: number, limit?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { account_id, offset, limit } = body

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const result = await executeSyncOrdersBatch(supabase, { account_id, offset, limit })

    if (!result.ok && !result.rate_limited) {
      return NextResponse.json(result, { status: result.error?.startsWith("ML ") ? 502 : 500 })
    }

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
