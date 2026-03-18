import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { executeSyncUpdates } from "@/domains/mercadolibre/sync/updates"

export const maxDuration = 300

/**
 * POST /api/ml/sync-updates
 * Pushes stock/price updates from local DB to ML publications.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { account_id, sync_type, warehouse_id, price_list_id, zero_missing_stock = false } = body

    if (!account_id || !sync_type) {
      return NextResponse.json({ error: "account_id y sync_type son requeridos" }, { status: 400 })
    }

    if ((sync_type === "price" || sync_type === "both") && !price_list_id) {
      return NextResponse.json({ error: "price_list_id es requerido para sincronizar precios" }, { status: 400 })
    }

    const result = await executeSyncUpdates(supabase, {
      account_id,
      sync_type,
      warehouse_id,
      price_list_id,
      zero_missing_stock,
    })

    if (!result.success && result.rate_limited) {
      return NextResponse.json(result)
    }

    if (!result.success) {
      return NextResponse.json(result, { status: result.error?.includes("Token") ? 401 : 500 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[sync-updates] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 },
    )
  }
}
