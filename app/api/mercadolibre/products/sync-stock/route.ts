/**
 * @deprecated Use /api/ml/sync-stock instead (account-based auth, longer timeout, process_runs audit).
 * This endpoint uses cookie-based auth which is being phased out.
 * Kept for backward compatibility.
 */
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

const ML_API_BASE = "https://api.mercadolibre.com"

export async function POST(request: NextRequest) {
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated with Mercado Libre" }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(userId)

    const { product_id, new_quantity } = await request.json()

    if (!product_id || new_quantity === undefined) {
      return NextResponse.json({ error: "product_id and new_quantity are required" }, { status: 400 })
    }

    console.log("[v0] Syncing stock for product:", product_id, "New quantity:", new_quantity)

    const supabase = await createClient()

    // Actualizar el producto principal en ML
    const updateResponse = await fetch(`${ML_API_BASE}/items/${product_id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        available_quantity: new_quantity,
      }),
    })

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error("[v0] Failed to update product:", errorText)
      throw new Error("Failed to update product stock")
    }

    await updateResponse.json()
    console.log("[v0] Product stock updated successfully")
    // El historial se registra vía webhook de ML (items topic),
    // capturando el cambio independientemente del origen.

    // Buscar publicaciones relacionadas en la base de datos
    const { data: relationships, error: relationshipError } = await supabase
      .from("listing_relationships")
      .select("*")
      .or(`original_listing_id.eq.${product_id},catalog_listing_id.eq.${product_id}`)

    if (relationshipError) {
      console.error("[v0] Failed to fetch relationships:", relationshipError)
    } else if (relationships && relationships.length > 0) {
      console.log("[v0] Found", relationships.length, "related listings")

      // Sincronizar stock con publicaciones relacionadas
      for (const relationship of relationships) {
        const relatedId =
          relationship.original_listing_id === product_id
            ? relationship.catalog_listing_id
            : relationship.original_listing_id

        console.log("[v0] Syncing stock with related listing:", relatedId)

        try {
          const syncResponse = await fetch(`${ML_API_BASE}/items/${relatedId}`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              available_quantity: new_quantity,
            }),
          })

          if (syncResponse.ok) {
            console.log("[v0] Successfully synced stock with:", relatedId)

            await supabase.from("stock_sync_log").insert({
              listing_id: relatedId,
              new_quantity: new_quantity,
              source: "manual_sync",
            })
            // Historial de la publicación relacionada se captura vía webhook de ML
          } else {
            console.error("[v0] Failed to sync stock with:", relatedId)
          }
        } catch (syncError) {
          console.error("[v0] Error syncing with related listing:", syncError)
        }
      }
    } else {
      console.log("[v0] No related listings found")
    }

    return NextResponse.json({
      success: true,
      message: "Stock actualizado y sincronizado con publicaciones relacionadas",
      product_id,
      new_quantity,
      synced_listings: relationships?.length || 0,
    })
  } catch (error) {
    console.error("[v0] Sync stock error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to sync stock", details: errorMessage }, { status: 500 })
  }
}
