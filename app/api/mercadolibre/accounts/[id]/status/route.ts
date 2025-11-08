import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = params.id

    // Obtener la cuenta de la base de datos
    const { data: account, error } = await supabase.from("ml_accounts").select("*").eq("id", accountId).single()

    if (error || !account) {
      return NextResponse.json({ connected: false, error: "Account not found" }, { status: 404 })
    }

    // Verificar si el token está expirado
    const now = new Date()
    const expiresAt = new Date(account.expires_at)
    const tokenExpired = now >= expiresAt

    return NextResponse.json({
      connected: !tokenExpired,
      tokenExpired,
      nickname: account.nickname,
      ml_user_id: account.ml_user_id,
      expires_at: account.expires_at,
    })
  } catch (error) {
    console.error("[v0] Error checking account status:", error)
    return NextResponse.json({ connected: false, error: "Failed to check status" }, { status: 500 })
  }
}
