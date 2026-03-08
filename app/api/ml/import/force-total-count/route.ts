import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * POST /api/ml/import/force-total-count
 * Fuerza la actualización del total_ml_publications desde ML
 * Esto es crítico para que el sistema sepa cuántos items importar
 */
export async function POST(request: Request) {
  console.log("[v0] ========== FORCE TOTAL COUNT ==========")
  
  try {
    const supabase = await createClient()
    const { account_id } = await request.json()

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    // Obtener cuenta
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .maybeSingle()

    if (!account || accountError) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    console.log("[v0] FORCE COUNT - Account:", account.nickname, "ml_user_id:", account.ml_user_id)
    console.log("[v0] FORCE COUNT - Current total_ml_publications:", account.total_ml_publications)

    // Llamar a ML para obtener el total
    const searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?limit=1&offset=0`
    console.log("[v0] FORCE COUNT - Calling ML API:", searchUrl)

    const mlResponse = await fetch(searchUrl, {
      headers: { 
        Authorization: `Bearer ${account.access_token}`,
        "Content-Type": "application/json"
      }
    })

    if (!mlResponse.ok) {
      const errorText = await mlResponse.text()
      console.error("[v0] FORCE COUNT - ML API error:", mlResponse.status, errorText)
      return NextResponse.json({ 
        error: `ML API error: ${mlResponse.status}`,
        details: errorText 
      }, { status: mlResponse.status })
    }

    const mlData = await mlResponse.json()
    const totalInML = mlData.paging?.total || 0

    console.log("[v0] FORCE COUNT - Total from ML API:", totalInML)
    console.log("[v0] FORCE COUNT - Paging info:", JSON.stringify(mlData.paging))

    if (totalInML === 0) {
      console.warn("[v0] FORCE COUNT - WARNING: ML returned 0 items. Check if account is properly connected.")
      return NextResponse.json({
        ok: true,
        message: "Account has 0 publications in MercadoLibre",
        total: 0,
        updated: false
      })
    }

    // Actualizar el total en la DB
    console.log("[v0] FORCE COUNT - Updating account with total:", totalInML)
    const { error: updateError } = await supabase
      .from("ml_accounts")
      .update({
        total_ml_publications: totalInML,
        updated_at: new Date().toISOString()
      })
      .eq("id", account_id)

    if (updateError) {
      console.error("[v0] FORCE COUNT - DB update error:", updateError)
      return NextResponse.json({ 
        error: "Failed to update account",
        details: updateError.message
      }, { status: 500 })
    }

    console.log("[v0] FORCE COUNT - Successfully updated total_ml_publications to:", totalInML)

    return NextResponse.json({
      ok: true,
      message: "Updated total_ml_publications",
      total: totalInML,
      updated: true,
      account_id
    })

  } catch (error: any) {
    console.error("[v0] FORCE COUNT - Error:", error)
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}
