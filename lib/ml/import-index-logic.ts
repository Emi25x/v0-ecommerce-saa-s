/**
 * ML Import Index Logic
 *
 * Extracted from app/api/ml/import/index/route.ts
 * Fetches item IDs from ML catalog and enqueues them for processing.
 */

export interface IndexBatchParams {
  job_id: string
  account_id: string
  offset?: number
}

export interface IndexBatchResult {
  success: boolean
  status: "indexing" | "completed" | "error"
  items_indexed: number
  total_items?: number
  total_offset?: number
  progress?: number
  error?: string
  message?: string
}

const BATCH_SIZE = 200

export async function executeIndexBatch(
  supabase: any,
  params: IndexBatchParams,
): Promise<IndexBatchResult> {
  const { job_id, account_id, offset = 0 } = params

  // Get job and account
  const { data: job, error: jobError } = await supabase
    .from("ml_import_jobs").select("*").eq("id", job_id).single()
  const { data: account, error: accountError } = await supabase
    .from("ml_accounts").select("*").eq("id", account_id).single()

  if (jobError || accountError || !job || !account) {
    return { success: false, status: "error", items_indexed: 0, error: "Job or account not found" }
  }

  const currentOffset = offset

  // Call ML search API
  const searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?limit=${BATCH_SIZE}&offset=${currentOffset}`
  console.log("[INDEX] Calling ML API:", searchUrl)

  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  })

  if (!searchResponse.ok) {
    const errorText = await searchResponse.text()
    if (searchResponse.status === 429) {
      return { success: false, status: "error", items_indexed: 0, error: "Rate limit", message: errorText }
    }
    throw new Error(`ML API error ${searchResponse.status}: ${errorText}`)
  }

  const searchData = await searchResponse.json()
  const itemIds: string[] = searchData.results || []
  const totalItems = searchData.paging?.total || 0

  console.log("[INDEX] Found", itemIds.length, "items at offset", currentOffset, "| total:", totalItems)

  // Enqueue item IDs
  let itemsIndexed = 0
  if (itemIds.length > 0) {
    const queueItems = itemIds.map((itemId: string) => ({
      job_id,
      ml_item_id: itemId,
      status: "pending",
    }))

    const { error: queueError } = await supabase
      .from("ml_import_queue")
      .upsert(queueItems, { onConflict: "job_id,ml_item_id", ignoreDuplicates: true })

    if (queueError) throw new Error(`Queue insert error: ${queueError.message}`)
    itemsIndexed = itemIds.length
  }

  // Update job progress
  const newOffset = currentOffset + itemIds.length
  await supabase
    .from("ml_import_jobs")
    .update({ total_items: totalItems, current_offset: newOffset, updated_at: new Date().toISOString() })
    .eq("id", job_id)

  // More items to index?
  if (itemIds.length === BATCH_SIZE && newOffset < totalItems) {
    return {
      success: true,
      status: "indexing",
      items_indexed: itemsIndexed,
      total_offset: newOffset,
      total_items: totalItems,
      progress: Math.round((newOffset / totalItems) * 100),
    }
  }

  // Indexing complete — switch to processing
  await supabase
    .from("ml_import_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", job_id)

  return {
    success: true,
    status: "completed",
    items_indexed: itemsIndexed,
    total_items: totalItems,
    message: "Indexing complete. Ready for worker processing.",
  }
}
