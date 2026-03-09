import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
export async function PUT(request: NextRequest) {
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const { item_id, price, available_quantity, title } = body

    console.log("[v0] Update item request:", { item_id, price, available_quantity, title })

    if (!item_id) {
      return NextResponse.json({ success: false, error: "item_id es requerido" }, { status: 400 })
    }

    const { data: listing, error: listingError } = await supabase
      .from("ml_listings")
      .select("account_id, ml_accounts!ml_listings_account_id_fkey(access_token)")
      .eq("ml_id", item_id)
      .maybeSingle()

    console.log("[v0] Listing query result:", { listing, listingError })

    let accessToken = listing?.ml_accounts?.access_token

    if (!accessToken) {
      console.log("[v0] No token in listing, searching for active account...")
      const { data: accounts, error: accountError } = await supabase
        .from("ml_accounts")
        .select("access_token")
        .gt("token_expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle()

      console.log("[v0] Active account query result:", { accounts, accountError })
      accessToken = accounts?.access_token
    }

    if (!accessToken) {
      console.log("[v0] No access token available")
      return NextResponse.json({ success: false, error: "No hay token de acceso disponible" }, { status: 401 })
    }

    console.log("[v0] Fetching item details from MercadoLibre...")
    const itemDetailsResponse = await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!itemDetailsResponse.ok) {
      console.log("[v0] Failed to fetch item details")
      return NextResponse.json(
        { success: false, error: "No se pudo obtener información del producto" },
        { status: itemDetailsResponse.status },
      )
    }

    const itemDetails = await itemDetailsResponse.json()
    const isCatalogItem = !!itemDetails.catalog_product_id
    console.log("[v0] Item details:", {
      catalog_product_id: itemDetails.catalog_product_id,
      isCatalogItem,
    })

    const updatePayload: any = {}
    if (price !== undefined) updatePayload.price = Number.parseFloat(price)
    if (available_quantity !== undefined) updatePayload.available_quantity = Number.parseInt(available_quantity)

    if (title !== undefined && !isCatalogItem) {
      updatePayload.title = title
      console.log("[v0] Including title in update (non-catalog item)")
    } else if (title !== undefined && isCatalogItem) {
      console.log("[v0] Skipping title update (catalog item - title cannot be modified)")
    }

    console.log("[v0] Final update payload:", updatePayload)

    const mlResponse = await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatePayload),
    })

    console.log("[v0] MercadoLibre response status:", mlResponse.status)

    if (!mlResponse.ok) {
      const errorData = await mlResponse.json()
      console.log("[v0] MercadoLibre error:", errorData)
      return NextResponse.json(
        { success: false, error: errorData.message || errorData.error || "Error al actualizar en MercadoLibre" },
        { status: mlResponse.status },
      )
    }

    const updatedItem = await mlResponse.json()
    console.log("[v0] Item updated successfully in MercadoLibre")

    const dbUpdatePayload: any = {
      updated_at: new Date().toISOString(),
    }
    if (updatedItem.price !== undefined) dbUpdatePayload.price = updatedItem.price
    if (updatedItem.available_quantity !== undefined)
      dbUpdatePayload.available_quantity = updatedItem.available_quantity

    const { error: updateError } = await supabase.from("ml_listings").update(dbUpdatePayload).eq("ml_id", item_id)

    if (updateError) {
      console.log("[v0] Error updating local database:", updateError)
    } else {
      console.log("[v0] Local database updated successfully")
    }

    return NextResponse.json({
      success: true,
      item: updatedItem,
      warning: isCatalogItem ? "El título no se puede modificar en productos de catálogo" : undefined,
    })
  } catch (error) {
    console.error("[v0] Error updating item:", error)
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 })
  }
}
