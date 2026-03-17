/**
 * ML Sync Stock Logic
 *
 * Extracted from app/api/ml/sync-stock/route.ts
 * Syncs stock between ML publications and local products DB.
 * Replaces self-fetch auto-continue with direct recursion option.
 */

import { getValidAccessToken } from "@/lib/mercadolibre"

/** Extract SKU from ML item: seller_custom_field → variations → attributes */
function extractSku(item: any): string | null {
  let sku: string | null = item.seller_custom_field || null

  if (!sku && Array.isArray(item.variations)) {
    for (const v of item.variations) {
      if (v.seller_custom_field) { sku = v.seller_custom_field; break }
    }
  }

  if (!sku && Array.isArray(item.attributes)) {
    const skuAttr = item.attributes.find((a: any) => a.id === "SELLER_SKU")
    if (skuAttr?.value_name) sku = skuAttr.value_name
  }

  return sku
}

/** Extract EAN/GTIN from ML item attributes */
function extractEanFromAttributes(item: any): string | null {
  if (!Array.isArray(item.attributes)) return null
  for (const attr of item.attributes) {
    if (["GTIN", "EAN", "ISBN", "UPC"].includes(attr.id) && attr.value_name) {
      return attr.value_name
    }
  }
  return null
}

export interface SyncStockParams {
  account_id: string
  limit?: number
  offset?: number
}

export interface SyncStockResult {
  success: boolean
  processed: number
  linked: number
  no_ean: number
  no_product_match: number
  errors: number
  total_in_ml: number
  has_more: boolean
  next_offset: number
  rate_limited?: boolean
  message?: string
  error?: string
}

/**
 * Execute one batch of stock sync.
 * Uses getValidAccessToken() instead of self-fetch for token refresh.
 */
export async function executeSyncStockBatch(
  supabase: any,
  params: SyncStockParams,
): Promise<SyncStockResult> {
  const { account_id, limit = 200, offset = 0 } = params

  // Get account
  const { data: account, error: accountError } = await supabase
    .from("ml_accounts").select("*").eq("id", account_id).single()

  if (accountError || !account) {
    return { success: false, processed: 0, linked: 0, no_ean: 0, no_product_match: 0, errors: 0, total_in_ml: 0, has_more: false, next_offset: 0, error: "Account not found" }
  }

  // Get valid token (auto-refreshes if expired)
  let accessToken: string
  try {
    accessToken = await getValidAccessToken(account_id)
  } catch (e: any) {
    return { success: false, processed: 0, linked: 0, no_ean: 0, no_product_match: 0, errors: 0, total_in_ml: 0, has_more: false, next_offset: 0, error: `Token refresh failed: ${e.message}` }
  }

  // Step 1: Get active item IDs from ML
  const searchResponse = await fetch(
    `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active&limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  const searchText = await searchResponse.text()
  if (searchText.includes("Too Many") || searchResponse.status === 429) {
    return { success: false, processed: 0, linked: 0, no_ean: 0, no_product_match: 0, errors: 0, total_in_ml: 0, has_more: false, next_offset: 0, rate_limited: true, message: "ML rate limit reached. Wait 1 hour." }
  }

  if (!searchResponse.ok) {
    return { success: false, processed: 0, linked: 0, no_ean: 0, no_product_match: 0, errors: 0, total_in_ml: 0, has_more: false, next_offset: 0, error: "Error fetching items from ML" }
  }

  const searchData = JSON.parse(searchText)
  const itemIds: string[] = searchData.results || []
  const totalInML = searchData.paging?.total || 0

  if (itemIds.length === 0) {
    return { success: true, processed: 0, linked: 0, no_ean: 0, no_product_match: 0, errors: 0, total_in_ml: totalInML, has_more: false, next_offset: offset + limit, message: "No items to process" }
  }

  // Update total publications count
  await supabase.from("ml_accounts").update({ total_ml_publications: totalInML }).eq("id", account_id)

  let linked = 0, noEan = 0, noProductMatch = 0, errors = 0, updated = 0

  // Step 2: Fetch details in batches of 20
  for (let i = 0; i < itemIds.length; i += 20) {
    const batchIds = itemIds.slice(i, i + 20)
    const idsParam = batchIds.join(",")

    const detailsResponse = await fetch(
      `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,seller_sku,seller_custom_field,available_quantity,status,price,permalink,attributes`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    const detailsText = await detailsResponse.text()
    if (detailsText.includes("Too Many") || detailsResponse.status === 429) {
      return {
        success: true, rate_limited: true,
        message: "Rate limit hit. Progress saved.",
        processed: i, linked, no_ean: noEan, no_product_match: noProductMatch,
        errors, total_in_ml: totalInML,
        has_more: true, next_offset: offset + i,
      }
    }

    if (!detailsResponse.ok) { errors += batchIds.length; continue }

    const items = JSON.parse(detailsText)

    // Step 3: For each item, extract SKU/EAN and match
    for (const itemWrapper of items) {
      if (itemWrapper.code !== 200 || !itemWrapper.body) { errors++; continue }

      const item = itemWrapper.body
      const sku = extractSku(item)
      let ean: string | null = sku

      if (!ean) ean = extractEanFromAttributes(item)

      if (!ean) {
        noEan++
        try {
          await supabase.from("ml_publications").upsert({
            account_id: account.id, ml_item_id: item.id,
            sku: sku ?? null, price: item.price,
            current_stock: item.available_quantity,
            updated_at: new Date().toISOString(),
          }, { onConflict: "account_id,ml_item_id" })
        } catch { /* best-effort */ }
        continue
      }

      // Match to product
      const { data: product } = await supabase
        .from("products").select("id, stock, title").eq("ean", ean).maybeSingle()

      if (!product) {
        noProductMatch++
        try {
          await supabase.from("ml_publications").upsert({
            account_id: account.id, ml_item_id: item.id,
            sku: sku ?? null, price: item.price,
            current_stock: item.available_quantity,
            updated_at: new Date().toISOString(),
          }, { onConflict: "account_id,ml_item_id" })
        } catch (e) { errors++ }
        continue
      }

      // Save/update with link
      try {
        const { data: existingPub } = await supabase
          .from("ml_publications").select("id, product_id")
          .eq("ml_item_id", item.id).maybeSingle()

        if (existingPub && !existingPub.product_id) linked++
        else if (!existingPub) linked++

        await supabase.from("ml_publications").upsert({
          account_id: account.id, ml_item_id: item.id,
          product_id: product.id, sku: sku ?? null,
          price: item.price, current_stock: item.available_quantity,
          updated_at: new Date().toISOString(),
        }, { onConflict: "account_id,ml_item_id" })

        updated++
      } catch (e) { errors++ }
    }

    // Delay between batches
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  // Update account sync timestamp
  await supabase.from("ml_accounts").update({
    last_stock_sync_at: new Date().toISOString(),
  }).eq("id", account_id)

  return {
    success: true,
    processed: itemIds.length,
    linked,
    no_ean: noEan,
    no_product_match: noProductMatch,
    errors,
    total_in_ml: totalInML,
    has_more: offset + limit < totalInML,
    next_offset: offset + limit,
  }
}
