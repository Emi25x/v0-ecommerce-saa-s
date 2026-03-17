import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { executeSyncStockBatch } from "@/lib/ml/sync-stock-logic"

export const maxDuration = 300

/**
 * POST /api/ml/sync-stock
 * Syncs stock: extracts ML publications with SKU, matches to DB, updates.
 * Auto-continue uses direct function calls instead of self-fetch.
 */
export async function POST(request: Request) {
  console.log("[v0] ========== SYNC-STOCK POST ==========")
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { account_id, limit = 200, offset = 0, auto_continue = false } = body

    if (!account_id) {
      return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
    }

    const result = await executeSyncStockBatch(supabase, { account_id, limit, offset })
    console.log("[v0] Sync-stock RESULTADO:", JSON.stringify(result))

    // Auto-continue: direct function call instead of self-fetch
    if (auto_continue && result.has_more && result.success && !result.rate_limited) {
      console.log("[v0] Auto-continuando desde offset:", result.next_offset)
      // Fire-and-forget via setTimeout to not block response
      executeSyncStockBatch(supabase, {
        account_id,
        limit,
        offset: result.next_offset,
      }).catch(e => console.error("[v0] Error en auto-continue:", e))
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error en sync-stock:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 })
  }
}

/**
 * GET /api/ml/sync-stock
 * Cron: auto-sync all accounts that have it enabled.
 * No longer self-fetches — calls the sync function directly.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: accounts } = await supabase
      .from("ml_accounts")
      .select("id, nickname")
      .eq("auto_sync_stock", true)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: "No hay cuentas con auto-sync habilitado" })
    }

    const results = []
    for (const account of accounts) {
      try {
        const data = await executeSyncStockBatch(supabase, { account_id: account.id, limit: 200 })
        results.push({ account: account.nickname, ...data })
      } catch (err) {
        results.push({ account: account.nickname, error: "Error" })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
