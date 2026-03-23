import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"
import {
  loadPublishContext,
  checkAlreadyPublished,
  searchCatalog,
  resolvePrice,
  publishToMl,
  addSellerSku,
  addDescription,
  doCatalogOptin,
  savePublication,
  saveCatalogPublication,
  updateProductMlStatus,
} from "@/domains/mercadolibre/publications/publisher"
import { resolveProductImage } from "@/domains/mercadolibre/publications/image-uploader"
import { buildMlTitle, buildMlDescription } from "@/domains/mercadolibre/publications/text-sanitizer"
import {
  buildTraditionalItem,
  buildCatalogItem,
} from "@/domains/mercadolibre/publications/builder"
import {
  resolveProductStockForWarehouse,
  getWarehouseSafetyStock,
  calculatePublishableStock,
  getWarehouseSourceKeys,
} from "@/domains/inventory/stock-helpers"
import { createStructuredLogger, genRequestId } from "@/lib/logger"
import { startRun } from "@/lib/process-runs"

export const maxDuration = 300

const BATCH_SIZE = 50
const CONCURRENCY = 3
const DELAY_BETWEEN_ITEMS_MS = 1000

interface BulkResult {
  product_id: string
  ean: string | null
  title: string | null
  status: "published" | "skipped" | "error"
  ml_item_id?: string
  reason?: string
  error?: string
}

/**
 * POST /api/ml/bulk-publish
 *
 * Publishes all products with publishable_stock > 0 for a given
 * warehouse + ML account, skipping already-published products.
 */
export async function POST(request: NextRequest) {
  const requestId = genRequestId()
  const log = createStructuredLogger({ request_id: requestId })

  try {
    const body = await request.json()
    const {
      warehouse_id,
      account_id,
      template_id,
      publish_mode = "linked",
      dry_run = false,
      limit = 0,
    } = body

    // ── Validation ────────────────────────────────────────────────────────
    if (!warehouse_id || !account_id || !template_id) {
      return NextResponse.json(
        { success: false, error: "warehouse_id, account_id y template_id son requeridos" },
        { status: 400 },
      )
    }

    const supabase = await createAdminClient()

    // ── Validate warehouse sources ────────────────────────────────────────
    const sources = await getWarehouseSourceKeys(supabase, warehouse_id)
    if (sources.length === 0) {
      return NextResponse.json(
        { success: false, error: `Warehouse ${warehouse_id} no tiene fuentes de importación asignadas.` },
        { status: 400 },
      )
    }
    const sourceKeys = sources.map((s) => s.source_key)

    // ── Load template + account (validates they exist, refreshes token) ──
    // Use a dummy product to test context loading — we only need template + account
    const { data: anyProduct } = await supabase
      .from("products")
      .select("id")
      .limit(1)
      .single()

    if (!anyProduct) {
      return NextResponse.json({ success: false, error: "No hay productos en la base." }, { status: 400 })
    }

    const contextCheck = await loadPublishContext({
      supabase,
      productId: anyProduct.id,
      templateId: template_id,
      accountId: account_id,
      refreshTokenFn: refreshTokenIfNeeded,
    })
    if (!contextCheck.ok) {
      return NextResponse.json(contextCheck.body, { status: contextCheck.status })
    }
    const { template, marginPercent, accessToken, validAccount } = contextCheck.ctx

    // ── Safety stock ──────────────────────────────────────────────────────
    const safetyStock = await getWarehouseSafetyStock(supabase, warehouse_id)

    // ── Get already-published product IDs for this account ────────────────
    const { data: existingPubs } = await supabase
      .from("ml_publications")
      .select("product_id")
      .eq("account_id", account_id)

    const publishedSet = new Set<string>(
      (existingPubs ?? []).map((p: any) => p.product_id).filter(Boolean),
    )

    // ── Fetch candidate products in batches ───────────────────────────────
    // Products that have stock in any of the warehouse's source keys
    const jsonbOrFilter = sourceKeys.map((k) => `stock_by_source->>${k}.not.is.null`).join(",")

    let totalCandidates = 0
    let alreadyPublished = 0
    let skippedNoStock = 0
    let published = 0
    let errors = 0
    const results: BulkResult[] = []

    log.info("Bulk publish started", "ml.bulk_publish.start", {
      warehouse_id,
      account_id,
      template_id: template_id,
      publish_mode,
      dry_run,
      limit: limit || "all",
      source_keys: sourceKeys,
      safety_stock: safetyStock,
    })

    // Start audit trail
    const run = await startRun(supabase, "ml_bulk_publish", `Bulk Publish ML — ${dry_run ? "dry run" : "real"}`)

    let offset = 0
    let keepGoing = true

    while (keepGoing) {
      const { data: batch, error: batchError } = await supabase
        .from("products")
        .select("id, ean, sku, title, cost_price, stock_by_source, image_url")
        .or(jsonbOrFilter)
        .order("title", { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1)

      if (batchError || !batch || batch.length === 0) {
        keepGoing = false
        break
      }

      offset += batch.length
      if (batch.length < BATCH_SIZE) keepGoing = false

      for (const product of batch as any[]) {
        // Check limit
        if (limit > 0 && (published + skippedNoStock + alreadyPublished + errors) >= limit) {
          keepGoing = false
          break
        }

        totalCandidates++

        // ── Already published? ──────────────────────────────────────────
        if (publishedSet.has(product.id)) {
          alreadyPublished++
          continue
        }

        // ── Calculate publishable stock ─────────────────────────────────
        const sbs: Record<string, number> = product.stock_by_source ?? {}
        let warehouseStock = 0
        for (const key of sourceKeys) {
          warehouseStock += Number(sbs[key]) || 0
        }
        const { publishable_stock: publishableStock } = calculatePublishableStock(warehouseStock, safetyStock)

        if (publishableStock <= 0) {
          skippedNoStock++
          continue
        }

        // ── No EAN = can't publish ──────────────────────────────────────
        if (!product.ean) {
          skippedNoStock++
          results.push({
            product_id: product.id,
            ean: null,
            title: product.title,
            status: "skipped",
            reason: "sin_ean",
          })
          continue
        }

        // ── Dry run: just count ─────────────────────────────────────────
        if (dry_run) {
          results.push({
            product_id: product.id,
            ean: product.ean,
            title: product.title,
            status: "skipped",
            reason: "dry_run",
          })
          published++ // count as "would publish"
          continue
        }

        // ── Publish single product ──────────────────────────────────────
        try {
          const result = await publishSingleProduct({
            supabase,
            product,
            template,
            marginPercent,
            accessToken,
            validAccount,
            accountId: account_id,
            warehouseId: warehouse_id,
            publishableStock,
            publishMode: publish_mode,
          })

          if (result.success) {
            published++
            publishedSet.add(product.id) // prevent re-publish within same run
            results.push({
              product_id: product.id,
              ean: product.ean,
              title: product.title,
              status: "published",
              ml_item_id: result.ml_item_id,
            })
          } else if (result.skipped) {
            alreadyPublished++
            publishedSet.add(product.id)
            results.push({
              product_id: product.id,
              ean: product.ean,
              title: product.title,
              status: "skipped",
              reason: result.reason ?? "already_published",
              ml_item_id: result.ml_item_id,
            })
          } else {
            errors++
            results.push({
              product_id: product.id,
              ean: product.ean,
              title: product.title,
              status: "error",
              error: result.error,
            })
          }

          // Rate limit delay
          await sleep(DELAY_BETWEEN_ITEMS_MS)
        } catch (err: any) {
          errors++
          results.push({
            product_id: product.id,
            ean: product.ean,
            title: product.title,
            status: "error",
            error: err.message ?? "Unknown error",
          })
        }

        // Checkpoint every 50 products
        if ((published + errors) % 50 === 0) {
          await run.checkpoint({
            rows_processed: totalCandidates,
            rows_updated: published,
            rows_failed: errors,
            log_json: { already_published: alreadyPublished, skipped_no_stock: skippedNoStock },
          })
        }
      }
    }

    // ── Finalize ────────────────────────────────────────────────────────────
    const summary = {
      total_candidates: totalCandidates,
      already_published: alreadyPublished,
      published,
      skipped_no_stock: skippedNoStock,
      errors,
      dry_run,
      run_id: run.id,
    }

    log.info("Bulk publish completed", "ml.bulk_publish.complete", {
      warehouse_id,
      account_id,
      ...summary,
    })

    await run.complete({
      rows_processed: totalCandidates,
      rows_created: published,
      rows_failed: errors,
      log_json: {
        already_published: alreadyPublished,
        skipped_no_stock: skippedNoStock,
        warehouse_id,
        account_id,
        template_id,
        publish_mode,
        dry_run,
      },
    })

    return NextResponse.json({
      success: true,
      summary,
      results: results.slice(0, 200), // cap response size
      results_truncated: results.length > 200,
    })
  } catch (error: any) {
    log.error("Bulk publish failed", error, "ml.bulk_publish.error")
    return NextResponse.json(
      { success: false, error: error.message ?? "Internal error" },
      { status: 500 },
    )
  }
}

// ── Single product publish (reuses publisher.ts functions) ────────────────

async function publishSingleProduct(params: {
  supabase: any
  product: any
  template: any
  marginPercent: number
  accessToken: string
  validAccount: any
  accountId: string
  warehouseId: string
  publishableStock: number
  publishMode: string
}): Promise<{
  success: boolean
  skipped?: boolean
  ml_item_id?: string
  reason?: string
  error?: string
}> {
  const {
    supabase,
    product,
    template,
    marginPercent,
    accessToken,
    validAccount,
    accountId,
    warehouseId,
    publishableStock,
    publishMode,
  } = params

  // ── Duplicate check ──────────────────────────────────────────────────
  const alreadyPublished = await checkAlreadyPublished({
    ean: product.ean,
    productId: product.id,
    accountId,
    mlUserId: validAccount.ml_user_id,
    accessToken,
    supabase,
    product,
  })

  if (alreadyPublished.exists) {
    return {
      success: false,
      skipped: true,
      ml_item_id: alreadyPublished.item_id,
      reason: alreadyPublished.source === "mercadolibre" ? "already_in_ml" : "already_in_db",
    }
  }

  // ── Price ────────────────────────────────────────────────────────────
  const { finalPrice, priceCalculation } = await resolvePrice({
    costPrice: product.cost_price,
    marginPercent,
    supabase,
    productId: product.id,
    accountId,
  })

  if (!finalPrice) {
    return { success: false, error: "No se pudo calcular precio" }
  }

  // ── Image + title + description + catalog ───────────────────────────
  const { mlPictureId } = await resolveProductImage(product.image_url, accessToken)
  const mlTitle = buildMlTitle(template.title_template, product)
  const description = buildMlDescription(template.description_template, product)
  const { catalogProductId } = await searchCatalog(product.ean, accessToken)

  // ── Build ML item ───────────────────────────────────────────────────
  const stockForMl = publishableStock

  let mlItem: Record<string, unknown>
  if (publishMode === "catalog") {
    if (!catalogProductId) {
      return { success: false, error: "No está en catálogo ML" }
    }
    mlItem = buildCatalogItem({ template, catalogProductId, finalPrice, mlPictureId, stock: stockForMl })
  } else {
    const productWithStock = { ...product, stock: stockForMl }
    mlItem = buildTraditionalItem({ product: productWithStock, template, mlTitle, finalPrice, mlPictureId })
  }

  // ── Publish ─────────────────────────────────────────────────────────
  const { ok, data: mlData, errorResponse } = await publishToMl({ itemToPublish: mlItem, accessToken })

  if (!ok) {
    return { success: false, error: (errorResponse as any)?.error ?? "ML API error" }
  }

  // ── Post-publish steps ──────────────────────────────────────────────
  const sellerSku = product.ean || product.sku || null
  if (sellerSku) {
    await addSellerSku({ mlItemId: mlData.id, sku: sellerSku, accessToken })
  }
  await addDescription({ mlItemId: mlData.id, description, accessToken })
  await savePublication({ supabase, productId: product.id, accountId, mlData })

  // Catalog optin for linked mode
  if (publishMode === "linked" && catalogProductId) {
    const catalogListing = await doCatalogOptin({
      mlItemId: mlData.id,
      mlItemStatus: mlData.status,
      catalogProductId,
      accessToken,
    })
    if (catalogListing) {
      await saveCatalogPublication({
        supabase,
        productId: product.id,
        accountId,
        catalogListing,
        fallbackTitle: mlData.title,
        fallbackPrice: mlData.price,
      })
    }
  }

  await updateProductMlStatus({ supabase, productId: product.id, accountId, mlData })

  return { success: true, ml_item_id: mlData.id }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
