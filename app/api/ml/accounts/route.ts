import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET /api/ml/accounts
 * Retorna lista de cuentas ML configuradas
 */
export async function GET() {
  try {
    const supabase = await createClient()
    
    // Obtener user_id del usuario autenticado si existe
    const { data: { user } } = await supabase.auth.getUser()

    let query = supabase
      .from("ml_accounts")
      .select("id, nickname, ml_user_id")
      .order("nickname", { ascending: true })
    
    // Filtrar por user_id si el usuario está autenticado (cuentas propias)
    // Si no hay user_id guardado en ml_accounts (cuentas viejas), igual las muestra
    if (user?.id) {
      query = query.or(`user_id.eq.${user.id},user_id.is.null`)
    }

    const { data: accounts, error } = await query

    if (error) {
      console.error("[v0] Error fetching ML accounts:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ accounts: accounts || [] })
  } catch (error: any) {
    console.error("[v0] ML accounts error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
