import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"
import { executeMlSync } from "@/domains/mercadolibre/sync-logic"

/**
 * POST /api/ml/sync
 * Syncs orders, items, and questions for a single ML account.
 */
export async function POST(request: NextRequest) {
  try {
    const { accountId, ml_user_id } = await request.json()

    if (!accountId && !ml_user_id) {
      return NextResponse.json({ error: "accountId o ml_user_id es requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    let query = supabase.from("ml_accounts").select("*")
    if (accountId) query = query.eq("id", accountId)
    else if (ml_user_id) query = query.eq("ml_user_id", ml_user_id.toString())

    const { data: account, error: accountError } = await query.single()
    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    const validAccount = await refreshTokenIfNeeded(account)
    const accessToken = validAccount.access_token

    const result = await executeMlSync(supabase, accountId || account.id, accessToken, account.ml_user_id)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error de sincronización" },
      { status: 500 },
    )
  }
}

/**
 * GET /api/ml/sync
 * Syncs all active accounts.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: accounts } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, access_token, refresh_token, token_expires_at")
      .gt("token_expires_at", new Date().toISOString())

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: "No hay cuentas activas para sincronizar" })
    }

    const results = []
    for (const account of accounts) {
      try {
        const validAccount = await refreshTokenIfNeeded(account)
        const result = await executeMlSync(supabase, account.id, validAccount.access_token, account.ml_user_id)
        results.push({ accountId: account.id, ...result })
      } catch (err) {
        results.push({ accountId: account.id, error: err instanceof Error ? err.message : "Error" })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error("[v0] Sync all error:", error)
    return NextResponse.json({ error: "Error en sincronización global" }, { status: 500 })
  }
}
