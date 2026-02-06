import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET /api/ml/accounts
 * Retorna lista de cuentas ML configuradas
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: accounts, error } = await supabase
      .from("ml_accounts")
      .select("id, nickname, ml_user_id")
      .order("nickname", { ascending: true })

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
