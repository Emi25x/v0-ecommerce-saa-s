import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"
import {
  loadPublishContext,
  checkAlreadyPublished,
  searchCatalog,
  resolvePrice,
  calculateActualMargin,
  publishToMl,
  addSellerSku,
  addDescription,
  doCatalogOptin,
  savePublication,
  saveCatalogPublication,
  updateProductMlStatus,
  buildWarnings,
} from "@/domains/mercadolibre/publications/publisher"
import { resolveProductImage } from "@/domains/mercadolibre/publications/image-uploader"
import { buildMlTitle, buildMlDescription } from "@/domains/mercadolibre/publications/text-sanitizer"
import {
  buildTraditionalItem,
  buildCatalogItem,
  validateTraditionalItem,
} from "@/domains/mercadolibre/publications/builder"
import {
  resolveProductStockForWarehouse,
  getWarehouseSafetyStock,
  calculatePublishableStock,
  getWarehouseSourceKeys,
} from "@/domains/inventory/stock-helpers"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

// POST: Publicar un producto del catalogo a ML
export async function POST(request: NextRequest) {
  const log = createStructuredLogger({ request_id: genRequestId() })

  try {
    const body = await request.json()
    const {
      product_id,
      template_id,
      account_id,
      warehouse_id,
      override_price,
      preview_only = true,
      publish_mode = "linked",
      force_republish = false,
    } = body

    if (!product_id || !template_id || !account_id) {
      return NextResponse.json(
        { success: false, error: "product_id, template_id y account_id son requeridos" },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // ── Load product, template, account ─────────────────────────────────────
    const loaded = await loadPublishContext({
      supabase,
      productId: product_id,
      templateId: template_id,
      accountId: account_id,
      refreshTokenFn: refreshTokenIfNeeded,
    })
    if (!loaded.ok) return NextResponse.json(loaded.body, { status: loaded.status })
    const { product, template, account, marginPercent, accessToken, validAccount } = loaded.ctx

    // ── Resolve stock from warehouse (FASE 3 + 4 + 5) ───────────────────────
    let publishableStock = 0
    let warehouseStock = 0
    let safetyStock = 0
    let stockMode: "warehouse_consolidated" | "legacy_fallback" = "legacy_fallback"

    if (warehouse_id) {
      // FASE 5: Verify warehouse has source assignments
      const sources = await getWarehouseSourceKeys(supabase, warehouse_id)
      if (sources.length === 0) {
        log.warn("Warehouse has no import sources assigned", "ml.publish.warehouse_no_sources", {
          product_id,
          ean: product.ean ?? null,
          warehouse_id,
          account_id,
        })
        return NextResponse.json(
          {
            success: false,
            error: `El warehouse ${warehouse_id} no tiene fuentes de importación asignadas. Verificar configuración de import_sources.`,
            warehouse_id,
          },
          { status: 400 },
        )
      }

      // Resolve warehouse-consolidated stock
      const resolved = await resolveProductStockForWarehouse(supabase, warehouse_id, [product_id])
      warehouseStock = resolved.stockMap[product_id] ?? 0
      stockMode = resolved.mode

      // Apply safety stock
      safetyStock = await getWarehouseSafetyStock(supabase, warehouse_id)
      const stockResult = calculatePublishableStock(warehouseStock, safetyStock)
      publishableStock = stockResult.publishable_stock

      log.info("Stock resolved from warehouse", "ml.publish.stock_resolved", {
        product_id,
        ean: product.ean ?? null,
        warehouse_id,
        warehouse_stock: warehouseStock,
        safety_stock: safetyStock,
        publishable_stock: publishableStock,
        source_keys: resolved.source_keys,
        stock_mode: stockMode,
        account_id,
      })
    } else {
      // No warehouse_id provided — log explicit warning, use global stock as last resort
      warehouseStock = product.stock ?? 0
      publishableStock = warehouseStock

      log.warn(
        "No warehouse_id provided — using global products.stock as fallback. This is deprecated.",
        "ml.publish.stock_resolved",
        {
          product_id,
          ean: product.ean ?? null,
          global_stock: warehouseStock,
          publishable_stock: publishableStock,
          stock_mode: "legacy_fallback",
          account_id,
        },
      )
    }

    // ── FASE 4: Pre-publication stock validation ─────────────────────────────
    if (publishableStock <= 0 && !preview_only) {
      log.info("Publication skipped — no publishable stock", "ml.publish.skipped_no_stock", {
        product_id,
        ean: product.ean ?? null,
        warehouse_id: warehouse_id ?? null,
        warehouse_stock: warehouseStock,
        safety_stock: safetyStock,
        publishable_stock: publishableStock,
        account_id,
      })
      return NextResponse.json(
        {
          success: false,
          skipped: true,
          reason: "no_publishable_stock",
          message: `Stock publicable es 0. warehouse_stock=${warehouseStock}, safety_stock=${safetyStock}, publishable_stock=${publishableStock}`,
          product_id,
          product_ean: product.ean,
          product_title: product.title,
          warehouse_id: warehouse_id ?? null,
          warehouse_stock: warehouseStock,
          safety_stock: safetyStock,
          publishable_stock: publishableStock,
        },
        { status: 200 },
      )
    }

    // ── Check duplicates ────────────────────────────────────────────────────
    const alreadyPublishedInfo = await checkAlreadyPublished({
      ean: product.ean,
      productId: product_id,
      accountId: account_id,
      mlUserId: validAccount.ml_user_id,
      accessToken,
      supabase,
      product,
    })
    if (alreadyPublishedInfo.exists && !preview_only) {
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: alreadyPublishedInfo.source === "mercadolibre" ? "already_published" : "already_in_db",
        existing_item_id: alreadyPublishedInfo.item_id,
        message: `El EAN ${product.ean} ya está publicado (${alreadyPublishedInfo.item_id})`,
        product_title: product.title,
        product_ean: product.ean,
      })
    }

    // ── Resolve price (pricing engine first, then legacy ML calculator) ────
    const {
      finalPrice,
      priceCalculation,
      priceMode,
      errorMessage: priceError,
    } = await resolvePrice({
      overridePrice: override_price,
      costPrice: product.cost_price,
      marginPercent,
      supabase,
      productId: product_id,
      accountId: account_id,
    })
    if (!finalPrice) return NextResponse.json({ success: false, error: priceError }, { status: 400 })

    // ── Resolve image, title, description, catalog ──────────────────────────
    const { mlPictureId, imageWarning } = await resolveProductImage(product.image_url, accessToken)
    const mlTitle = buildMlTitle(template.title_template, product)
    const description = buildMlDescription(template.description_template, product)
    const { catalogProductId } = await searchCatalog(product.ean, accessToken)
    console.log("[v0] Product image_url from DB:", product.image_url)
    console.log("[v0] ML Title from template:", mlTitle)

    // ── Build ML item (using publishable_stock instead of global stock) ─────
    // Cap at 50 per ML rules
    const stockForMl = Math.min(publishableStock, 50)

    let mlItem: Record<string, unknown>
    if (publish_mode === "catalog") {
      if (!catalogProductId)
        return NextResponse.json(
          {
            success: false,
            error: `No está en catálogo ML (ISBN: ${product.ean}). Usa modo "Tradicional".`,
            not_in_catalog: true,
          },
          { status: 400 },
        )
      mlItem = buildCatalogItem({ template, catalogProductId, finalPrice, mlPictureId, stock: stockForMl })
    } else {
      // Override product.stock with publishable stock for the builder
      const productWithWarehouseStock = { ...product, stock: stockForMl }
      mlItem = buildTraditionalItem({ product: productWithWarehouseStock, template, mlTitle, finalPrice, mlPictureId })
    }

    // ── Validate ────────────────────────────────────────────────────────────
    if (publish_mode !== "catalog") {
      const validationError = validateTraditionalItem(mlItem, product.id, product.title)
      if (validationError)
        return NextResponse.json({ success: false, error: validationError, validation_error: true }, { status: 400 })
    }
    if (!mlItem.price || typeof mlItem.price !== "number" || (mlItem.price as number) <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Precio inválido: ${mlItem.price}. No se pudo calcular el precio de venta.`,
          validation_error: true,
        },
        { status: 400 },
      )
    }

    // ── Preview mode ────────────────────────────────────────────────────────
    const actualMargin = calculateActualMargin({ finalPrice, priceCalculation, costPrice: product.cost_price })
    if (preview_only) {
      return NextResponse.json({
        success: true,
        preview: {
          price: finalPrice,
          price_mode: priceMode,
          margin: Math.round(actualMargin * 10) / 10,
          multiplier: Math.round(finalPrice / product.cost_price),
          exchange_rate: priceCalculation?.exchangeRate || 1765,
          ml_item: mlItem,
          stock_info: {
            warehouse_id: warehouse_id ?? null,
            warehouse_stock: warehouseStock,
            safety_stock: safetyStock,
            publishable_stock: publishableStock,
            stock_mode: stockMode,
          },
          already_published: alreadyPublishedInfo.exists
            ? { item_id: alreadyPublishedInfo.item_id, source: alreadyPublishedInfo.source }
            : null,
        },
      })
    }

    // ── Publish to ML ───────────────────────────────────────────────────────
    const { ok, data: mlData, errorResponse } = await publishToMl({ itemToPublish: mlItem, accessToken })
    if (!ok) {
      return NextResponse.json(
        {
          ...errorResponse,
          product_info: {
            id: product.id,
            title: product.title,
            author: product.author,
            brand: product.brand,
            ean: product.ean,
            cost_price: product.cost_price,
          },
        },
        { status: 400 },
      )
    }

    // ── Post-publish steps ──────────────────────────────────────────────────
    const sellerSkuValue = product.ean || product.sku || null
    const sellerSkuAdded = sellerSkuValue
      ? await addSellerSku({ mlItemId: mlData.id, sku: sellerSkuValue, accessToken })
      : false
    const { added: descriptionAdded, error: descriptionError } = await addDescription({
      mlItemId: mlData.id,
      description,
      accessToken,
    })
    await savePublication({ supabase, productId: product.id, accountId: account.id, mlData })

    let catalogListing = null
    if (publish_mode === "linked" && catalogProductId) {
      catalogListing = await doCatalogOptin({
        mlItemId: mlData.id,
        mlItemStatus: mlData.status,
        catalogProductId,
        accessToken,
      })
      if (catalogListing)
        await saveCatalogPublication({
          supabase,
          productId: product.id,
          accountId: account.id,
          catalogListing,
          fallbackTitle: mlData.title,
          fallbackPrice: mlData.price,
        })
    }
    await updateProductMlStatus({ supabase, productId: product_id, accountId: account.id, mlData })

    const warnings = buildWarnings({
      imageWarning,
      sellerSkuAdded,
      sellerSkuValue,
      descriptionAdded,
      descriptionError,
      publishMode: publish_mode,
      catalogProductId,
      catalogListing,
    })

    log.info("Publication completed", "ml.publish.success", {
      product_id,
      ean: product.ean ?? null,
      ml_item_id: mlData.id,
      warehouse_id: warehouse_id ?? null,
      warehouse_stock: warehouseStock,
      safety_stock: safetyStock,
      publishable_stock: publishableStock,
      stock_sent_to_ml: stockForMl,
      stock_mode: stockMode,
      account_id,
    })

    return NextResponse.json({
      success: true,
      ml_item_id: mlData.id,
      permalink: mlData.permalink,
      status: mlData.status,
      price_mode: priceMode,
      product_title: product.title,
      product_ean: product.ean,
      stock_info: {
        warehouse_id: warehouse_id ?? null,
        warehouse_stock: warehouseStock,
        safety_stock: safetyStock,
        publishable_stock: publishableStock,
        stock_sent_to_ml: stockForMl,
        stock_mode: stockMode,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      image_url_sent: product.image_url || null,
      ml_picture_id: mlPictureId || null,
      image_warning: imageWarning,
      pictures_in_response: mlData.pictures || [],
      seller_sku_added: sellerSkuAdded,
      seller_sku_value: sellerSkuValue,
      description_added: descriptionAdded,
      description_error: descriptionError,
      catalog_listing: catalogListing
        ? { status: catalogListing.status, catalog_product_id: catalogListing.catalog_product_id }
        : null,
    })
  } catch (error: any) {
    console.error("[v0] Error in publish route:", error)
    return NextResponse.json({ success: false, error: error.message || "Error interno del servidor" }, { status: 500 })
  }
}
