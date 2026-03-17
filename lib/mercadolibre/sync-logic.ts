/**
 * MercadoLibre Sync Logic
 *
 * Extracted from app/api/mercadolibre/sync/route.ts
 * Syncs orders, items/publications, and questions from ML to cache tables.
 */

const ML_API_BASE = "https://api.mercadolibre.com"

export interface MLSyncResult {
  success: boolean
  results: {
    orders: { synced: number; errors: number }
    items: { synced: number; errors: number }
    questions: { synced: number; errors: number }
  }
  message?: string
  error?: string
}

/**
 * Syncs orders, items, and questions for a single ML account.
 * @param supabase - Supabase client
 * @param accountId - ML account UUID
 * @param accessToken - Valid ML access token
 * @param mlUserId - ML user ID (numeric)
 */
export async function executeMlSync(
  supabase: any,
  accountId: string,
  accessToken: string,
  mlUserId: string,
): Promise<MLSyncResult> {
  const results = {
    orders: { synced: 0, errors: 0 },
    items: { synced: 0, errors: 0 },
    questions: { synced: 0, errors: 0 },
  }

  // 1. Sync recent orders (last 30 days)
  try {
    const ordersResponse = await fetch(
      `${ML_API_BASE}/orders/search?seller=${mlUserId}&sort=date_desc&limit=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (ordersResponse.ok) {
      const ordersData = await ordersResponse.json()
      for (const order of ordersData.results || []) {
        const { error } = await supabase.from("ml_orders_cache").upsert({
          id: order.id.toString(),
          account_id: accountId,
          order_data: order,
          status: order.status,
          total_amount: order.total_amount,
          buyer_nickname: order.buyer?.nickname,
          cached_at: new Date().toISOString(),
        }, { onConflict: "id" })
        if (error) results.orders.errors++
        else results.orders.synced++
      }
    }
  } catch (e) {
    console.error("[SYNC] Error syncing orders:", e)
  }

  // 2. Sync active items/publications
  try {
    const itemsResponse = await fetch(
      `${ML_API_BASE}/users/${mlUserId}/items/search?status=active&limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (itemsResponse.ok) {
      const itemsData = await itemsResponse.json()
      const itemIds: string[] = itemsData.results || []

      for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20)
        const multiGetResponse = await fetch(
          `${ML_API_BASE}/items?ids=${batch.join(",")}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )

        if (multiGetResponse.ok) {
          const itemsDetails = await multiGetResponse.json()
          for (const itemWrapper of itemsDetails) {
            if (itemWrapper.code === 200 && itemWrapper.body) {
              const item = itemWrapper.body
              const { error } = await supabase.from("ml_products_cache").upsert({
                id: item.id,
                account_id: accountId,
                title: item.title,
                price: item.price,
                currency_id: item.currency_id,
                available_quantity: item.available_quantity,
                sold_quantity: item.sold_quantity,
                status: item.status,
                thumbnail: item.thumbnail,
                permalink: item.permalink,
                category_id: item.category_id,
                item_data: item,
                cached_at: new Date().toISOString(),
              }, { onConflict: "id" })
              if (error) results.items.errors++
              else results.items.synced++
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("[SYNC] Error syncing items:", e)
  }

  // 3. Sync unanswered questions
  try {
    const questionsResponse = await fetch(
      `${ML_API_BASE}/questions/search?seller_id=${mlUserId}&status=UNANSWERED&limit=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (questionsResponse.ok) {
      const questionsData = await questionsResponse.json()
      for (const question of questionsData.questions || []) {
        const { error } = await supabase.from("ml_questions_cache").upsert({
          id: question.id.toString(),
          account_id: accountId,
          item_id: question.item_id,
          question_text: question.text,
          status: question.status,
          from_user_id: question.from?.id?.toString(),
          question_data: question,
          cached_at: new Date().toISOString(),
        }, { onConflict: "id" })
        if (error) results.questions.errors++
        else results.questions.synced++
      }
    }
  } catch (e) {
    console.error("[SYNC] Error syncing questions:", e)
  }

  // Update last sync timestamp
  await supabase.from("ml_accounts").update({
    last_sync_at: new Date().toISOString(),
  }).eq("id", accountId)

  return {
    success: true,
    results,
    message: `Sync complete: ${results.orders.synced} orders, ${results.items.synced} items, ${results.questions.synced} questions`,
  }
}
