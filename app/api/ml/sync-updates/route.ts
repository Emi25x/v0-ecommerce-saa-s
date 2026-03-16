import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 300

/**
 * POST /api/ml/sync-updates
 * Sincroniza stock, precio o ambos en publicaciones de ML desde la base de datos interna.
 *
 * Body:
 *   account_id        string   - ID de cuenta ML
 *   sync_type         string   - 'stock' | 'price' | 'both'
 *   warehouse_id      string?  - ID de almacén para tomar stock (opcional; usa products.stock si no se indica)
 *   price_list_id     string?  - ID de lista de precios (requerido si sync_type incluye precio)
 *   zero_missing_stock boolean - Poner stock=0 en publicaciones no vinculadas a ningún producto
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      account_id,
      sync_type,
      warehouse_id,
      price_list_id,
      zero_missing_stock = false,
    } = body

    if (!account_id || !sync_type) {
      return NextResponse.json({ error: "account_id y sync_type son requeridos" }, { status: 400 })
    }

    const syncStock = sync_type === "stock" || sync_type === "both"
    const syncPrice = sync_type === "price" || sync_type === "both"

    if (syncPrice && !price_list_id) {
      return NextResponse.json({ error: "price_list_id es requerido para sincronizar precios" }, { status: 400 })
    }

    // Obtener cuenta ML
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    // Refrescar token si es necesario
    let accessToken = account.access_token
    if (new Date(account.token_expires_at) <= new Date()) {
      const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : "http://localhost:3000"
      const refreshResponse = await fetch(`${baseUrl}/api/mercadolibre/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id }),
      })
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json()
        accessToken = refreshData.access_token
      } else {
        return NextResponse.json({ error: "Error al refrescar token" }, { status: 401 })
      }
    }

    // Obtener todas las publicaciones de la cuenta
    const { data: publications, error: pubError } = await supabase
      .from("ml_publications")
      .select("ml_item_id, product_id, current_stock, price")
      .eq("account_id", account_id)

    if (pubError) {
      return NextResponse.json({ error: "Error al obtener publicaciones" }, { status: 500 })
    }

    const linkedPubs = (publications || []).filter((p) => p.product_id)
    const unlinkedPubs = (publications || []).filter((p) => !p.product_id)
    const productIds = [...new Set(linkedPubs.map((p) => p.product_id as string))]

    // Construir mapa de stock
    const stockMap: Record<string, number> = {}
    if (syncStock && productIds.length > 0) {
      if (warehouse_id) {
        const { data: stockRows } = await supabase
          .from("supplier_catalog_items")
          .select("product_id, stock_quantity")
          .in("product_id", productIds)
          .eq("warehouse_id", warehouse_id)
          .order("stock_quantity", { ascending: false })

        for (const s of stockRows ?? []) {
          if (s.product_id && !(s.product_id in stockMap)) {
            stockMap[s.product_id] = s.stock_quantity ?? 0
          }
        }
      }

      // Fallback a products.stock para los que no se encontraron
      const missingIds = productIds.filter((id) => !(id in stockMap))
      if (missingIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id, stock")
          .in("id", missingIds)
        for (const p of products ?? []) {
          stockMap[p.id] = p.stock ?? 0
        }
      }
    }

    // Construir mapa de precios
    const priceMap: Record<string, number> = {}
    if (syncPrice && productIds.length > 0 && price_list_id) {
      const { data: priceRows } = await supabase
        .from("product_prices")
        .select("product_id, calculated_price")
        .in("product_id", productIds)
        .eq("price_list_id", price_list_id)

      for (const p of priceRows ?? []) {
        if (p.product_id) priceMap[p.product_id] = p.calculated_price
      }
    }

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    }

    let updated = 0
    let skipped = 0
    let errors = 0
    let zeroed = 0

    // Actualizar publicaciones vinculadas
    for (const pub of linkedPubs) {
      const updateBody: Record<string, any> = {}

      if (syncStock) {
        const newStock = stockMap[pub.product_id as string] ?? 0
        if (newStock !== pub.current_stock) {
          updateBody.available_quantity = newStock
        }
      }

      if (syncPrice) {
        const newPrice = priceMap[pub.product_id as string]
        if (newPrice !== undefined && newPrice !== pub.price) {
          updateBody.price = newPrice
        }
      }

      if (Object.keys(updateBody).length === 0) {
        skipped++
        continue
      }

      try {
        const res = await fetch(`https://api.mercadolibre.com/items/${pub.ml_item_id}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify(updateBody),
          signal: AbortSignal.timeout(10_000),
        })

        if (res.ok) {
          const localUpdate: Record<string, any> = { updated_at: new Date().toISOString() }
          if (updateBody.available_quantity !== undefined) localUpdate.current_stock = updateBody.available_quantity
          if (updateBody.price !== undefined) localUpdate.price = updateBody.price
          await supabase
            .from("ml_publications")
            .update(localUpdate)
            .eq("account_id", account_id)
            .eq("ml_item_id", pub.ml_item_id)
          updated++
        } else {
          if (res.status === 429) {
            return NextResponse.json({
              success: false,
              rate_limited: true,
              updated,
              skipped,
              errors,
              zeroed,
              message: "Rate limit de ML alcanzado. Esperá unos minutos e intentá de nuevo.",
            })
          }
          const err = await res.json().catch(() => ({}))
          console.error(`[sync-updates] Error ML ${pub.ml_item_id}:`, err)
          errors++
        }
      } catch {
        errors++
      }

      await new Promise((r) => setTimeout(r, 200))
    }

    // Poner stock en 0 para publicaciones no vinculadas si se solicitó
    if (zero_missing_stock && syncStock && unlinkedPubs.length > 0) {
      for (const pub of unlinkedPubs) {
        if ((pub.current_stock ?? 0) === 0) continue

        try {
          const res = await fetch(`https://api.mercadolibre.com/items/${pub.ml_item_id}`, {
            method: "PUT",
            headers: authHeaders,
            body: JSON.stringify({ available_quantity: 0 }),
            signal: AbortSignal.timeout(10_000),
          })

          if (res.ok) {
            await supabase
              .from("ml_publications")
              .update({ current_stock: 0, updated_at: new Date().toISOString() })
              .eq("account_id", account_id)
              .eq("ml_item_id", pub.ml_item_id)
            zeroed++
          } else {
            errors++
          }
        } catch {
          errors++
        }

        await new Promise((r) => setTimeout(r, 200))
      }
    }

    // Actualizar timestamp en la cuenta
    const accountUpdate: Record<string, any> = {}
    if (syncStock) accountUpdate.last_stock_sync_at = new Date().toISOString()
    if (Object.keys(accountUpdate).length > 0) {
      await supabase.from("ml_accounts").update(accountUpdate).eq("id", account_id)
    }

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      errors,
      zeroed,
      total_linked: linkedPubs.length,
      total_unlinked: unlinkedPubs.length,
    })
  } catch (error) {
    console.error("[sync-updates] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}
