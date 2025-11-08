import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { item_ids } = body

    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return NextResponse.json({ success: false, error: "item_ids es requerido y debe ser un array" }, { status: 400 })
    }

    const supabase = await createClient()
    const results = []

    for (const item_id of item_ids) {
      try {
        // Obtener el access token
        const { data: listing } = await supabase
          .from("ml_listings")
          .select("account_id, ml_accounts!ml_listings_account_id_fkey(access_token)")
          .eq("ml_id", item_id)
          .maybeSingle()

        if (!listing || !listing.ml_accounts) {
          results.push({ item_id, success: false, error: "No se encontró el token de acceso" })
          continue
        }

        const accessToken = (listing.ml_accounts as any).access_token

        // Analizar competencia para obtener price_to_win
        const competitionRes = await fetch(`https://api.mercadolibre.com/items/${item_id}/price_to_win`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!competitionRes.ok) {
          results.push({ item_id, success: false, error: "No se pudo obtener price_to_win" })
          continue
        }

        const competitionData = await competitionRes.json()

        if (!competitionData.price_to_win) {
          results.push({ item_id, success: false, error: "No hay price_to_win disponible" })
          continue
        }

        // Actualizar precio en MercadoLibre
        const updateRes = await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            price: competitionData.price_to_win,
          }),
        })

        if (!updateRes.ok) {
          const errorData = await updateRes.json()
          results.push({ item_id, success: false, error: errorData.message || "Error al actualizar precio" })
          continue
        }

        // Actualizar en base de datos
        await supabase
          .from("ml_listings")
          .update({
            price: competitionData.price_to_win,
            updated_at: new Date().toISOString(),
          })
          .eq("ml_id", item_id)

        results.push({
          item_id,
          success: true,
          new_price: competitionData.price_to_win,
        })

        // Esperar un poco entre requests para no saturar la API
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch (error: any) {
        results.push({ item_id, success: false, error: error.message })
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    return NextResponse.json({
      success: true,
      summary: {
        total: item_ids.length,
        success: successCount,
        failed: failCount,
      },
      results,
    })
  } catch (error: any) {
    console.error("Error in bulk price update:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
