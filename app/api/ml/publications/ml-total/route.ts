import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

export const dynamic = "force-dynamic"

/**
 * GET /api/ml/publications/ml-total?account_id=X
 *
 * Devuelve:
 *   total_ml  — total de items en ML (via items/search paging.total)
 *   total_db  — total en nuestra DB ml_publications para esa cuenta
 *   diff      — total_ml - total_db  (positivo = faltan por importar)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account_id = searchParams.get("account_id")

  if (!account_id) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  // 1. Total en DB (HEAD query — no lee filas)
  const { count: total_db } = await supabase
    .from("ml_publications")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account_id)

  // 2. Total en ML via items/search?search_type=scan&limit=1 (solo lee paging.total)
  const { data: account } = await supabase
    .from("ml_accounts")
    .select("ml_user_id")
    .eq("id", account_id)
    .single()

  if (!account) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
  }

  let total_ml: number | null = null
  let ml_error: string | null = null

  try {
    const token = await getValidAccessToken(account_id)
    const url   = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?search_type=scan&limit=1`
    const res   = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      total_ml = data.paging?.total ?? null
    } else {
      ml_error = `ML HTTP ${res.status}`
    }
  } catch (e: any) {
    ml_error = e.message
  }

  const diff = total_ml != null && total_db != null ? total_ml - total_db : null

  return NextResponse.json({
    ok:       true,
    total_db: total_db  ?? 0,
    total_ml,
    diff,
    ml_error,
  })
}
