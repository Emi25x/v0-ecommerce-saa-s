/**
 * ML Sync Updates Logic
 *
 * Extracted from app/api/ml/sync-updates/route.ts
 * Pushes stock/price changes from local DB to ML publications.
 * Uses getValidAccessToken() instead of self-fetch for token refresh.
 */

import { getValidAccessToken } from "@/lib/mercadolibre"

export interface SyncUpdatesParams {
  account_id: string
  sync_type: "stock" | "price" | "both"
  warehouse_id?: string
  price_list_id?: string
  zero_missing_stock?: boolean
}

export interface SyncUpdatesResult {
  success: boolean
  updated: number
  skipped: number
  errors: number
  zeroed: number
  total_linked: number
  total_unlinked: number
  rate_limited?: boolean
  message?: string
  error?: string
}

export async function executeSyncUpdates(supabase: any, params: SyncUpdatesParams): Promise<SyncUpdatesResult> {
  const { account_id, sync_type, warehouse_id, price_list_id, zero_missing_stock = false } = params

  const syncStock = sync_type === "stock" || sync_type === "both"
  const syncPrice = sync_type === "price" || sync_type === "both"

  // Get valid token (auto-refreshes if expired) — replaces self-fetch
  let accessToken: string
  try {
    accessToken = await getValidAccessToken(account_id)
  } catch (e: any) {
    return {
      success: false,
      updated: 0,
      skipped: 0,
      errors: 0,
      zeroed: 0,
      total_linked: 0,
      total_unlinked: 0,
      error: `Token refresh failed: ${e.message}`,
    }
  }

  // Get all publications for the account
  const { data: publications, error: pubError } = await supabase
    .from("ml_publications")
    .select("ml_item_id, product_id, current_stock, price")
    .eq("account_id", account_id)

  if (pubError) {
    return {
      success: false,
      updated: 0,
      skipped: 0,
      errors: 0,
      zeroed: 0,
      total_linked: 0,
      total_unlinked: 0,
      error: "Error fetching publications",
    }
  }

  const linkedPubs = (publications || []).filter((p: any) => p.product_id)
  const unlinkedPubs = (publications || []).filter((p: any) => !p.product_id)
  const productIds = Array.from(new Set<string>(linkedPubs.map((p: any) => p.product_id)))

  // Build stock map
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

    // Fallback to products.stock
    const missingIds = productIds.filter((id) => !(id in stockMap))
    if (missingIds.length > 0) {
      const { data: products } = await supabase.from("products").select("id, stock").in("id", missingIds)
      for (const p of products ?? []) {
        stockMap[p.id] = p.stock ?? 0
      }
    }
  }

  // Build price map
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

  let updated = 0,
    skipped = 0,
    errors = 0,
    zeroed = 0

  // Update linked publications
  for (const pub of linkedPubs) {
    const updateBody: Record<string, any> = {}

    if (syncStock) {
      const newStock = stockMap[pub.product_id as string] ?? 0
      if (newStock !== pub.current_stock) updateBody.available_quantity = newStock
    }

    if (syncPrice) {
      const newPrice = priceMap[pub.product_id as string]
      if (newPrice !== undefined && newPrice !== pub.price) updateBody.price = newPrice
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
          return {
            success: false,
            rate_limited: true,
            updated,
            skipped,
            errors,
            zeroed,
            total_linked: linkedPubs.length,
            total_unlinked: unlinkedPubs.length,
            message: "ML rate limit reached.",
          }
        }
        errors++
      }
    } catch {
      errors++
    }

    await new Promise((r) => setTimeout(r, 200))
  }

  // Zero out unlinked publications if requested
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

  // Update account timestamp
  if (syncStock) {
    await supabase.from("ml_accounts").update({ last_stock_sync_at: new Date().toISOString() }).eq("id", account_id)
  }

  return {
    success: true,
    updated,
    skipped,
    errors,
    zeroed,
    total_linked: linkedPubs.length,
    total_unlinked: unlinkedPubs.length,
  }
}
