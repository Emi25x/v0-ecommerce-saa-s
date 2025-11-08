import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    // Obtener todas las configuraciones activas
    const { data: trackings, error: trackingError } = await supabase
      .from("price_tracking")
      .select("*")
      .eq("enabled", true)

    if (trackingError) throw trackingError

    if (!trackings || trackings.length === 0) {
      return NextResponse.json({ success: true, message: "No hay trackings activos", updated: 0 })
    }

    const results = []

    for (const tracking of trackings) {
      try {
        // Obtener el access token
        const { data: listing } = await supabase
          .from("ml_listings")
          .select("price, account_id, ml_accounts!ml_listings_account_id_fkey(access_token)")
          .eq("ml_id", tracking.ml_listing_id)
          .maybeSingle()

        if (!listing || !listing.ml_accounts) {
          console.log(`[v0] No se encontró listing o token para ${tracking.ml_listing_id}`)
          continue
        }

        const accessToken = (listing.ml_accounts as any).access_token
        const currentPrice = Number.parseFloat(listing.price)

        // Analizar competencia
        const competitionRes = await fetch(
          `https://api.mercadolibre.com/items/${tracking.ml_listing_id}/price_to_win`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        )

        if (!competitionRes.ok) {
          console.log(`[v0] Error al obtener price_to_win para ${tracking.ml_listing_id}`)
          continue
        }

        const competitionData = await competitionRes.json()

        if (!competitionData.price_to_win) {
          console.log(`[v0] No hay price_to_win para ${tracking.ml_listing_id}`)
          continue
        }

        const priceToWin = Number.parseFloat(competitionData.price_to_win)

        // Actualizar el price_to_win conocido
        await supabase
          .from("price_tracking")
          .update({
            current_price_to_win: priceToWin,
            last_checked_at: new Date().toISOString(),
          })
          .eq("ml_listing_id", tracking.ml_listing_id)

        // Verificar si necesita actualizar el precio
        if (priceToWin < currentPrice && priceToWin >= tracking.min_price) {
          // Actualizar precio en MercadoLibre
          const updateRes = await fetch(`https://api.mercadolibre.com/items/${tracking.ml_listing_id}`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              price: priceToWin,
            }),
          })

          if (updateRes.ok) {
            // Actualizar en base de datos
            await supabase
              .from("ml_listings")
              .update({
                price: priceToWin,
                updated_at: new Date().toISOString(),
              })
              .eq("ml_id", tracking.ml_listing_id)

            // Registrar en historial
            await supabase.from("price_tracking_history").insert({
              ml_listing_id: tracking.ml_listing_id,
              old_price: currentPrice,
              new_price: priceToWin,
              price_to_win: priceToWin,
              reason: "Actualización automática por cambio en price_to_win",
            })

            // Actualizar timestamp de última actualización
            await supabase
              .from("price_tracking")
              .update({
                last_updated_at: new Date().toISOString(),
              })
              .eq("ml_listing_id", tracking.ml_listing_id)

            results.push({
              item_id: tracking.ml_listing_id,
              success: true,
              old_price: currentPrice,
              new_price: priceToWin,
            })

            console.log(
              `[v0] Precio actualizado automáticamente: ${tracking.ml_listing_id} de $${currentPrice} a $${priceToWin}`,
            )
          } else {
            console.log(`[v0] Error al actualizar precio en ML para ${tracking.ml_listing_id}`)
          }
        } else if (priceToWin < tracking.min_price) {
          console.log(
            `[v0] Price to win ($${priceToWin}) está por debajo del mínimo ($${tracking.min_price}) para ${tracking.ml_listing_id}`,
          )
        }

        // Esperar entre requests
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error: any) {
        console.error(`[v0] Error procesando tracking para ${tracking.ml_listing_id}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      checked: trackings.length,
      updated: results.length,
      results,
    })
  } catch (error: any) {
    console.error("[v0] Error in auto price tracking:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
