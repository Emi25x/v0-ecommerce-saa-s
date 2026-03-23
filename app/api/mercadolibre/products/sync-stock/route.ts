/**
 * @deprecated Use /api/ml/sync-stock instead (account-based auth, batch sync, process_runs audit).
 * This endpoint uses cookie-based auth (ml_user_id) for single-item stock updates.
 * Kept as-is because the interface differs from /api/ml/sync-stock (batch vs single item).
 * New callers should use /api/ml/sync-stock.
 */
import { type NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-auth"
import { getValidAccessToken } from "@/lib/mercadolibre"

const ML_API_BASE = "https://api.mercadolibre.com"

export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.response

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

    const updateResponse = await fetch(`${ML_API_BASE}/items/${product_id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ available_quantity: new_quantity }),
    })

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      throw new Error(`Failed to update product stock: ${errorText}`)
    }

    await updateResponse.json()

    const { data: relationships } = await auth.supabase
      .from("listing_relationships")
      .select("*")
      .or(`original_listing_id.eq.${product_id},catalog_listing_id.eq.${product_id}`)

    if (relationships && relationships.length > 0) {
      for (const relationship of relationships) {
        const relatedId =
          relationship.original_listing_id === product_id
            ? relationship.catalog_listing_id
            : relationship.original_listing_id

        try {
          const syncResponse = await fetch(`${ML_API_BASE}/items/${relatedId}`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ available_quantity: new_quantity }),
          })

          if (syncResponse.ok) {
            await auth.supabase.from("stock_sync_log").insert({
              listing_id: relatedId,
              new_quantity: new_quantity,
              source: "manual_sync",
            })
          }
        } catch {
          // Continue syncing other related listings
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Stock actualizado y sincronizado con publicaciones relacionadas",
      product_id,
      new_quantity,
      synced_listings: relationships?.length || 0,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to sync stock", details: errorMessage }, { status: 500 })
  }
}
