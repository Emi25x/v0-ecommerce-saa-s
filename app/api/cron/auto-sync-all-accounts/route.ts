import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[v0] Iniciando sincronización automática de todas las cuentas...")

  try {
    // Obtener todas las cuentas activas
    const { data: accounts, error } = await supabase
      .from("ml_accounts")
      .select("id, nickname")

    if (error || !accounts) {
      console.error("[v0] Error obteniendo cuentas:", error)
      return NextResponse.json({ error: "Error obteniendo cuentas" }, { status: 500 })
    }

    console.log(`[v0] ${accounts.length} cuenta(s) encontrada(s)`)

    // Iniciar sincronización para cada cuenta
    const results = []
    for (const account of accounts) {
      console.log(`[v0] Iniciando sync para cuenta: ${account.nickname}`)
      
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_VERCEL_URL || 'http://localhost:3000'}/api/ml/auto-sync-all`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset: 0, accountId: account.id })
        })

        const result = await response.json()
        results.push({
          account: account.nickname,
          status: response.ok ? "iniciado" : "error",
          ...result
        })
      } catch (error) {
        console.error(`[v0] Error iniciando sync para ${account.nickname}:`, error)
        results.push({
          account: account.nickname,
          status: "error",
          error: error instanceof Error ? error.message : "Error desconocido"
        })
      }
    }

    console.log("[v0] Sincronización automática iniciada para todas las cuentas")

    return NextResponse.json({
      success: true,
      message: "Sincronización automática iniciada",
      accounts: accounts.length,
      results
    })

  } catch (error) {
    console.error("[v0] Error en cron auto-sync:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error desconocido" 
    }, { status: 500 })
  }
}
