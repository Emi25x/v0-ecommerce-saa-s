import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/debug/ml-accounts-count
 * Cuenta y lista cuentas ML usando service role key (bypassing RLS)
 * SOLO PARA DEBUG - REMOVER EN PRODUCCIÓN
 */
export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        error: "Missing Supabase credentials",
        hasUrl: !!supabaseUrl,
        hasServiceRole: !!serviceRoleKey,
      },
      { status: 500 },
    )
  }

  try {
    // Crear cliente con service role para bypassear RLS
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Contar todas las cuentas
    const { count, error: countError } = await supabase.from("ml_accounts").select("*", { count: "exact", head: true })

    if (countError) {
      return NextResponse.json(
        {
          error: "Count query failed",
          details: countError.message,
          code: countError.code,
        },
        { status: 500 },
      )
    }

    // Listar últimas 3 cuentas (sin datos sensibles)
    const { data: accounts, error: selectError } = await supabase
      .from("ml_accounts")
      .select("id, user_id, name, nickname, created_at")
      .order("created_at", { ascending: false })
      .limit(3)

    if (selectError) {
      return NextResponse.json(
        {
          error: "Select query failed",
          details: selectError.message,
          code: selectError.code,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      count: count || 0,
      recentAccounts: accounts || [],
      supabaseProjectRef: new URL(supabaseUrl).hostname.split(".")[0],
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Unexpected error",
        message: error.message,
      },
      { status: 500 },
    )
  }
}
