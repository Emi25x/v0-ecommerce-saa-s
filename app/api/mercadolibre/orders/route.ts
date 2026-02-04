import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  console.log("[v0] ===== ORDERS ENDPOINT EXECUTING =====")

  try {
    const { createClient } = await import("@/lib/supabase/server")
    console.log("[v0] Orders - Imported createClient")

    const searchParams = request.nextUrl.searchParams
    const accountId = searchParams.get("account_id")

    console.log("[v0] Orders - Params:", { accountId })

    const supabase = await createClient()
    console.log("[v0] Orders - Supabase client created")

    // Solo leer de la DB sin hacer llamadas a ML
    // Las órdenes se sincronizarán automáticamente con el cron
    
    let accountsQuery = supabase.from("ml_accounts").select("*")
    if (accountId && accountId !== "all") {
      accountsQuery = accountsQuery.eq("id", accountId)
    }

    const { data: accounts, error: accountsError } = await accountsQuery

    if (accountsError) {
      console.error("[v0] Orders - Database error:", accountsError)
      return NextResponse.json({ error: "Database error", details: accountsError.message }, { status: 500 })
    }

    console.log("[v0] Orders - Found accounts:", accounts?.length || 0)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        orders: [],
        paging: { total: 0, limit: 0, offset: 0 },
        message: "No hay cuentas configuradas"
      })
    }

    // DESACTIVADO: No hacer llamadas a ML API
    // Las órdenes se sincronizarán automáticamente con el cron diariamente
    console.log("[v0] Orders - NOT fetching from ML API (cuota desactivada)")
    
    return NextResponse.json({
      orders: [],
      paging: { total: 0, limit: 0, offset: 0 },
      message: "Las órdenes se sincronizan automáticamente. Próxima sincronización a las 9:00 AM",
      status: "sync_pending"
    })

  } catch (error: any) {
    console.error("[v0] Orders - FATAL ERROR:", error.message)
    console.error("[v0] Orders - Stack:", error.stack)

    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 },
    )
  }
}
