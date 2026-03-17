/**
 * ML Import Worker Logic
 *
 * Extracted from app/api/ml/import/worker/route.ts
 * Claims pending items from queue, fetches details from ML multiget,
 * matches SKU/GTIN to products, and upserts ml_publications.
 */

/**
 * Normalizes SKU/ISBN for consistent matching.
 * - Numeric (ISBN/GTIN): digits only, ISBN-10 → ISBN-13 conversion
 * - Alphanumeric SKU: trim + remove [-\s.] + toUpperCase
 */
export function normalizeSKU(sku: string | null | undefined): string | null {
  if (!sku) return null
  const trimmed = sku.trim()
  const isNumeric = /^[\d\s\-\.]+$/.test(trimmed)

  if (isNumeric) {
    let normalized = trimmed.replace(/\D/g, "")
    if (normalized.length === 10) {
      const base = "978" + normalized.slice(0, 9)
      let sum = 0
      for (let i = 0; i < 12; i++) {
        sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3)
      }
      const checkDigit = (10 - (sum % 10)) % 10
      normalized = base + checkDigit
    }
    return normalized
  } else {
    return trimmed.replace(/[-\s.]/g, "").toUpperCase()
  }
}

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

/** Extract GTIN from ML item attributes/variations */
function extractGtin(item: any): string | null {
  if (Array.isArray(item.attributes)) {
    const gtinAttr = item.attributes.find((attr: any) => attr.id === "GTIN")
    if (gtinAttr) return gtinAttr.value_name
  }

  if (Array.isArray(item.variations)) {
    for (const variation of item.variations) {
      if (Array.isArray(variation.attributes)) {
        const varGtinAttr = variation.attributes.find((attr: any) => attr.id === "GTIN")
        if (varGtinAttr) return varGtinAttr.value_name
      }
    }
  }

  return null
}

export interface WorkerBatchParams {
  job_id: string
  batch_size?: number
}

export interface WorkerBatchResult {
  success: boolean
  status?: string
  processed: number
  failed: number
  linked: number
  unmatched: number
  unmatched_percent: number
  has_more: boolean
  message?: string
  error?: string
}

export async function executeWorkerBatch(
  supabase: any,
  params: WorkerBatchParams,
): Promise<WorkerBatchResult> {
  const { job_id, batch_size = 20 } = params

  // Get job + account
  const { data: job } = await supabase
    .from("ml_import_jobs")
    .select("*, ml_accounts(*)")
    .eq("id", job_id)
    .single()

  if (!job) {
    return { success: false, processed: 0, failed: 0, linked: 0, unmatched: 0, unmatched_percent: 0, has_more: false, error: "Job not found" }
  }

  const account = job.ml_accounts

  // Atomically claim batch (uses FOR UPDATE SKIP LOCKED)
  const { data: pendingItems, error: claimError } = await supabase.rpc(
    "claim_import_items",
    { p_job_id: job_id, p_limit: batch_size },
  )

  if (claimError) {
    console.error("[WORKER] Error claiming items:", claimError)
    return { success: false, processed: 0, failed: 0, linked: 0, unmatched: 0, unmatched_percent: 0, has_more: false, error: "Error claiming items" }
  }

  if (!pendingItems || pendingItems.length === 0) {
    // Check if job is complete
    const { count } = await supabase
      .from("ml_import_queue")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job_id)
      .in("status", ["pending", "processing"])

    if (count === 0) {
      await supabase.from("ml_import_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job_id)

      return { success: true, status: "completed", processed: 0, failed: 0, linked: 0, unmatched: 0, unmatched_percent: 0, has_more: false, message: "Import completed" }
    }

    return { success: true, status: "processing", processed: 0, failed: 0, linked: 0, unmatched: 0, unmatched_percent: 0, has_more: true, message: "Items being processed by other workers" }
  }

  const itemIds = pendingItems.map((item: any) => item.ml_item_id)

  // ML multiget
  const idsParam = itemIds.join(",")
  const multigetUrl = `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,price,available_quantity,status,permalink,seller_custom_field,attributes,variations`

  const multigetResponse = await fetch(multigetUrl, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  })

  if (!multigetResponse.ok) {
    if (multigetResponse.status === 429) {
      const retryAfterHeader = multigetResponse.headers.get("Retry-After")
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader) : 120
      const nextRetryAt = new Date(Date.now() + retryAfterSeconds * 1000)

      await supabase.from("ml_import_queue").update({
        status: "pending",
        next_retry_at: nextRetryAt.toISOString(),
      }).in("ml_item_id", itemIds).eq("job_id", job_id)

      return { success: false, processed: 0, failed: 0, linked: 0, unmatched: 0, unmatched_percent: 0, has_more: true, error: "Rate limit", message: `Retry in ${retryAfterSeconds}s` }
    }
    throw new Error(`ML multiget error: ${multigetResponse.status}`)
  }

  const itemsData = await multigetResponse.json()

  let processed = 0, failed = 0, linked = 0, unmatched = 0

  for (const itemResponse of itemsData) {
    const item = itemResponse.body

    if (!item || itemResponse.code !== 200) {
      failed++
      const currentItem = pendingItems.find((i: any) => i.ml_item_id === itemResponse.id)
      if (currentItem) {
        await supabase.from("ml_import_queue").update({
          status: "failed",
          last_error: `ML API returned ${itemResponse.code}`,
          processed_at: new Date().toISOString(),
        }).eq("id", currentItem.id)
      }
      continue
    }

    try {
      const candidateSku = extractSku(item)
      const candidateGtin = extractGtin(item)
      const normalizedSku = normalizeSKU(candidateSku)
      const normalizedGtin = normalizeSKU(candidateGtin)

      // Match to product
      let product_id = null
      let matched_by: "sku" | "gtin" | null = null

      if (normalizedSku || normalizedGtin) {
        if (normalizedSku) {
          const { data: productBySku } = await supabase
            .from("products").select("id").eq("sku", normalizedSku).limit(1).single()
          if (productBySku) { product_id = productBySku.id; matched_by = "sku"; linked++ }
        }
        if (!product_id && normalizedGtin) {
          const { data: productByGtin } = await supabase
            .from("products").select("id").eq("sku", normalizedGtin).limit(1).single()
          if (productByGtin) { product_id = productByGtin.id; matched_by = "gtin"; linked++ }
          else unmatched++
        } else if (!product_id) {
          unmatched++
        }
      } else {
        unmatched++
      }

      // Upsert ml_publications
      await supabase.from("ml_publications").upsert({
        account_id: account.id,
        ml_item_id: item.id,
        product_id,
        matched_by,
        title: item.title,
        price: item.price,
        current_stock: item.available_quantity,
        status: item.status,
        permalink: item.permalink,
        sku: candidateSku ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "account_id,ml_item_id" })

      await supabase.from("ml_import_queue").update({
        status: "completed",
        processed_at: new Date().toISOString(),
      }).eq("ml_item_id", item.id).eq("job_id", job_id)

      processed++
    } catch (itemError: any) {
      console.error("[WORKER] Error processing item", item.id, itemError)
      const currentItem = pendingItems.find((i: any) => i.ml_item_id === item.id)
      const attempts = currentItem?.attempts || 1

      const shouldRetry = attempts < 3 && (
        itemError.status === 429 || (itemError.status >= 500 && itemError.status < 600)
      )

      if (shouldRetry) {
        const delayMinutes = Math.pow(2, attempts)
        await supabase.from("ml_import_queue").update({
          status: "pending",
          last_error: itemError.message || "Unknown error",
          next_retry_at: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(),
        }).eq("id", currentItem?.id)
      } else {
        failed++
        await supabase.from("ml_import_queue").update({
          status: "failed",
          last_error: itemError.message || "Max retries exceeded",
          processed_at: new Date().toISOString(),
        }).eq("id", currentItem?.id)
      }
    }
  }

  // Update job stats
  await supabase.from("ml_import_jobs").update({
    processed_items: job.processed_items + processed,
    failed_items: job.failed_items + failed,
    updated_at: new Date().toISOString(),
  }).eq("id", job_id)

  return {
    success: true,
    processed,
    failed,
    linked,
    unmatched,
    unmatched_percent: processed > 0 ? Math.round((unmatched / processed) * 100) : 0,
    has_more: pendingItems.length === batch_size,
  }
}
