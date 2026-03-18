/**
 * ML Auto-Sync Logic
 *
 * Extracted from app/api/ml/auto-sync-all/route.ts
 * Syncs ML publications for a single account in batches.
 * Replaces self-recursive fetch() with direct loop.
 */

export interface AutoSyncParams {
  accountId: string
  maxItems?: number
}

export interface AutoSyncResult {
  success: boolean
  processed: number
  linked: number
  errors: number
  total: number
  error?: string
}

/**
 * Syncs all active ML items for a single account.
 * Processes in batches of 50 with 1s delay between batches.
 * Replaces the self-recursive fetch pattern.
 */
export async function executeAutoSyncAccount(
  supabase: any,
  params: AutoSyncParams,
): Promise<AutoSyncResult> {
  const { accountId, maxItems = Infinity } = params

  // Get account
  const { data: account } = await supabase
    .from("ml_accounts").select("*").eq("id", accountId).single()

  if (!account) {
    return { success: false, processed: 0, linked: 0, errors: 0, total: 0, error: "Account not found" }
  }

  let offset = 0
  let totalProcessed = 0
  let totalLinked = 0
  let totalErrors = 0
  let totalInML = 0
  const BATCH_SIZE = 50

  while (totalProcessed < maxItems) {
    // Get active item IDs
    const mlUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active&limit=${BATCH_SIZE}&offset=${offset}`
    const mlResponse = await fetch(mlUrl, {
      headers: { Authorization: `Bearer ${account.access_token}` },
    })

    if (!mlResponse.ok) {
      if (mlResponse.status === 429) {
        return { success: true, processed: totalProcessed, linked: totalLinked, errors: totalErrors, total: totalInML, error: "Rate limited" }
      }
      return { success: false, processed: totalProcessed, linked: totalLinked, errors: totalErrors, total: totalInML, error: `ML API ${mlResponse.status}` }
    }

    const mlData = await mlResponse.json()
    const itemIds: string[] = mlData.results || []
    totalInML = mlData.paging?.total || 0

    if (itemIds.length === 0) break

    // Process each item
    for (const itemId of itemIds) {
      try {
        const itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
          headers: { Authorization: `Bearer ${account.access_token}` },
        })
        if (!itemResponse.ok) continue

        const item = await itemResponse.json()

        // Extract SKU/GTIN
        let sku = item.seller_custom_field || ""
        let gtin = ""
        if (item.attributes) {
          const gtinAttr = item.attributes.find((a: any) => a.id === "GTIN" || a.id === "ISBN" || a.id === "EAN")
          if (gtinAttr) gtin = gtinAttr.value_name || ""
        }

        // Match product
        let product = null
        if (sku) {
          const { data } = await supabase.from("products").select("id").eq("sku", sku).maybeSingle()
          product = data
        }
        if (!product && gtin) {
          const { data } = await supabase.from("products").select("id").eq("ean", gtin).maybeSingle()
          product = data
        }

        // Upsert publication
        await supabase.from("ml_publications").upsert({
          account_id: account.id,
          ml_item_id: itemId,
          product_id: product?.id || null,
          title: item.title,
          price: item.price,
          current_stock: item.available_quantity,
          status: item.status,
          permalink: item.permalink,
          updated_at: new Date().toISOString(),
        }, { onConflict: "account_id,ml_item_id" })

        if (product) totalLinked++
        totalProcessed++
      } catch {
        totalErrors++
      }
    }

    offset += itemIds.length
    const hasMore = totalInML > offset

    if (!hasMore || itemIds.length === 0) break

    // Delay between batches
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // Update account stats
  await supabase.from("ml_accounts").update({
    last_stock_sync_at: new Date().toISOString(),
    total_ml_publications: totalInML,
  }).eq("id", account.id)

  console.log(`[AUTO-SYNC] Completed for ${account.nickname}: ${totalProcessed} processed, ${totalLinked} linked, ${totalErrors} errors`)

  return { success: true, processed: totalProcessed, linked: totalLinked, errors: totalErrors, total: totalInML }
}
