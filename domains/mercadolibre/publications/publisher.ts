/**
 * ML publication orchestrator — handles the full publish flow:
 *  - duplicate check (ML API + DB)
 *  - price calculation
 *  - image resolution
 *  - item building (traditional / catalog)
 *  - validation
 *  - ML API POST + post-publish steps (SKU, description, catalog optin)
 *  - DB persistence
 *
 * Extracted from app/api/ml/publish/route.ts — no logic changes.
 */

import { calculateMlPrice } from "@/domains/mercadolibre/price-calculator"
import { resolveProductImage } from "@/domains/mercadolibre/publications/image-uploader"
import { buildMlTitle, buildMlDescription } from "@/domains/mercadolibre/publications/text-sanitizer"
import {
  buildTraditionalItem,
  buildCatalogItem,
  validateTraditionalItem,
} from "@/domains/mercadolibre/publications/builder"
import type { SupabaseClient } from "@supabase/supabase-js"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublishInput {
  product_id: string
  template_id: string
  account_id: string
  override_price?: number
  preview_only?: boolean
  publish_mode?: "linked" | "catalog" | "traditional"
  force_republish?: boolean
}

export interface PublishResult {
  success: boolean
  status?: number // HTTP status for error responses
  [key: string]: unknown
}

// ─── Duplicate check ──────────────────────────────────────────────────────────

export async function checkAlreadyPublished(params: {
  ean: string | null | undefined
  productId: string
  accountId: string
  mlUserId: string
  accessToken: string
  supabase: SupabaseClient
  product: { ml_item_id?: string }
}): Promise<{ exists: boolean; item_id?: string; source?: string }> {
  const { ean, productId, accountId, mlUserId, accessToken, supabase, product } = params
  let info: { exists: boolean; item_id?: string; source?: string } = { exists: false }

  if (!ean) return info

  try {
    // Buscar items del vendedor que tengan este EAN en atributos
    const searchUrl = `https://api.mercadolibre.com/users/${mlUserId}/items/search?search_type=scan&attributes=GTIN:${ean}`
    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (searchResponse.ok) {
      const searchData = await searchResponse.json()
      if (searchData.results && searchData.results.length > 0) {
        const mlItemId = searchData.results[0]
        info = { exists: true, item_id: mlItemId, source: "mercadolibre" }

        // Guardar en products que ya está publicado (si no lo teníamos)
        if (!product.ml_item_id || product.ml_item_id !== mlItemId) {
          await supabase
            .from("products")
            .update({
              ml_item_id: mlItemId,
              account_id: accountId,
              ml_status: "active",
              ml_last_checked_at: new Date().toISOString(),
            })
            .eq("id", productId)
        }
      } else {
        // No está publicado en ML, actualizar last_checked
        await supabase.from("products").update({ ml_last_checked_at: new Date().toISOString() }).eq("id", productId)
      }
    }

    // Verificar en ml_publications (per-cuenta — products.ml_item_id es global y no sirve aquí)
    if (!info.exists) {
      const { data: existingPub } = await supabase
        .from("ml_publications")
        .select("ml_item_id")
        .eq("product_id", productId)
        .eq("account_id", accountId)
        .maybeSingle()

      if (existingPub) {
        info = { exists: true, item_id: existingPub.ml_item_id, source: "database" }
        // Sincronizar con products
        await supabase
          .from("products")
          .update({
            ml_item_id: existingPub.ml_item_id,
            account_id: accountId,
            ml_status: "active",
            ml_last_checked_at: new Date().toISOString(),
          })
          .eq("id", productId)
      }
    }
  } catch (searchError) {
    console.log("[v0] Error checking existing publication:", searchError)
  }

  return info
}

// ─── Catalog search ───────────────────────────────────────────────────────────

export async function searchCatalog(
  ean: string | null | undefined,
  accessToken: string,
): Promise<{ catalogProductId: string | null; familyName: string | null }> {
  let catalogProductId: string | null = null
  let familyName: string | null = null

  if (ean && accessToken) {
    try {
      const catalogSearch = await fetch(
        `https://api.mercadolibre.com/products/search?status=active&site_id=MLA&product_identifier=${ean}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )

      if (catalogSearch.ok) {
        const catalogData = await catalogSearch.json()
        if (catalogData.results && catalogData.results.length > 0) {
          catalogProductId = catalogData.results[0].id
          familyName = catalogData.results[0].name || catalogData.results[0].id
        }
      }
    } catch {
      // Continuar sin catalogo
    }
  }

  return { catalogProductId, familyName }
}

// ─── Price resolution ─────────────────────────────────────────────────────────

export async function resolvePrice(params: {
  overridePrice?: number
  costPrice?: number
  marginPercent: number
}): Promise<{
  finalPrice: number | null
  priceCalculation: Awaited<ReturnType<typeof calculateMlPrice>> | null
  errorMessage?: string
}> {
  const { overridePrice, costPrice, marginPercent } = params

  let finalPrice = overridePrice || null
  let priceCalculation: Awaited<ReturnType<typeof calculateMlPrice>> | null = null

  if (!finalPrice && costPrice) {
    priceCalculation = await calculateMlPrice({ costPriceEur: costPrice, marginPercent })
    finalPrice = priceCalculation.price
  }

  if (!finalPrice || finalPrice <= 0) {
    const errorMessage =
      finalPrice !== undefined && finalPrice !== null && finalPrice <= 0
        ? `Precio calculado inválido (${finalPrice}). Verificar costo y margen del producto.`
        : "No se pudo calcular el precio. El producto no tiene cost_price."
    return { finalPrice: null, priceCalculation, errorMessage }
  }

  return { finalPrice, priceCalculation }
}

// ─── ML publish + post-publish steps ──────────────────────────────────────────

export async function publishToMl(params: {
  itemToPublish: Record<string, unknown>
  accessToken: string
}): Promise<{ ok: boolean; data: any; errorResponse?: PublishResult }> {
  const { itemToPublish, accessToken } = params

  // Log para debug - ver exactamente que se envia a ML
  console.log("[v0] Item to publish - family_name:", itemToPublish.family_name)
  console.log("[v0] Item to publish - price:", itemToPublish.price)
  console.log("[v0] Item to publish - pictures:", JSON.stringify(itemToPublish.pictures))
  console.log("[v0] Item to publish - shipping:", JSON.stringify(itemToPublish.shipping))
  console.log(
    "[v0] Item to publish - attributes (first 5):",
    JSON.stringify((itemToPublish.attributes as Array<unknown>)?.slice(0, 5)),
  )

  const mlResponse = await fetch("https://api.mercadolibre.com/items", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(itemToPublish),
  })

  const mlData = await mlResponse.json()

  if (!mlResponse.ok) {
    console.log("[v0] ML Error Response:", JSON.stringify(mlData))
    return { ok: false, data: mlData, errorResponse: formatMlError(mlData) }
  }

  return { ok: true, data: mlData }
}

function formatMlError(mlData: any): PublishResult {
  let errorMsg = "Error al publicar en ML"
  const invalidFields: string[] = []

  if (mlData.cause && Array.isArray(mlData.cause)) {
    mlData.cause.forEach((cause: any) => {
      if (cause.message) {
        invalidFields.push(cause.message)
      }
      if (cause.field) {
        invalidFields.push(`Campo "${cause.field}": ${cause.message || "inválido"}`)
      }
    })
  }

  if (invalidFields.length > 0) {
    errorMsg = `Campos inválidos: ${invalidFields.join("; ")}`
  } else if (mlData.message) {
    errorMsg = mlData.message
  } else if (mlData.error) {
    errorMsg = mlData.error
  }

  return {
    success: false,
    error: errorMsg,
    invalid_fields: invalidFields.length > 0 ? invalidFields : undefined,
    ml_error_detail: mlData,
    status: 400,
  }
}

// ─── Post-publish: add seller_sku ─────────────────────────────────────────────

export async function addSellerSku(params: { mlItemId: string; sku: string; accessToken: string }): Promise<boolean> {
  const { mlItemId, sku, accessToken } = params
  try {
    console.log("[v0] Adding seller_sku to item", mlItemId, "value:", sku)
    const skuResponse = await fetch(`https://api.mercadolibre.com/items/${mlItemId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ seller_custom_field: sku }),
    })

    if (!skuResponse.ok) {
      const skuError = await skuResponse.json()
      console.log("[v0] Error adding seller_sku:", JSON.stringify(skuError))
      return false
    }
    console.log("[v0] seller_sku added successfully")
    return true
  } catch (skuErr) {
    console.log("[v0] Exception adding seller_sku:", skuErr)
    return false
  }
}

// ─── Post-publish: add description ────────────────────────────────────────────

export async function addDescription(params: {
  mlItemId: string
  description: string
  accessToken: string
}): Promise<{ added: boolean; error: string | null }> {
  const { mlItemId, description, accessToken } = params

  if (!description || !description.trim()) {
    console.log("[v0] No description to add (empty or null)")
    return { added: false, error: "Descripción vacía o no disponible" }
  }

  try {
    console.log("[v0] Adding description to item", mlItemId, "length:", description.length)
    const descResponse = await fetch(`https://api.mercadolibre.com/items/${mlItemId}/description`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plain_text: description }),
    })

    if (!descResponse.ok) {
      const descError = await descResponse.json()
      console.log("[v0] Error adding description:", JSON.stringify(descError))
      return { added: false, error: descError.message || descError.error || "Error desconocido" }
    }
    console.log("[v0] Description added successfully")
    return { added: true, error: null }
  } catch (descErr) {
    console.log("[v0] Exception adding description:", descErr)
    return { added: false, error: String(descErr) }
  }
}

// ─── Post-publish: catalog optin (linked mode) ───────────────────────────────

export async function doCatalogOptin(params: {
  mlItemId: string
  mlItemStatus: string
  catalogProductId: string
  accessToken: string
}): Promise<any | null> {
  const { mlItemId, mlItemStatus, catalogProductId, accessToken } = params

  try {
    // Si el item está pausado, activarlo primero
    if (mlItemStatus === "paused") {
      console.log("[v0] Item created as paused, activating before optin...")
      const activateResponse = await fetch(`https://api.mercadolibre.com/items/${mlItemId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "active" }),
      })

      if (!activateResponse.ok) {
        const activateError = await activateResponse.json()
        console.error("[v0] Error activating item:", activateError)
        throw new Error("No se pudo activar el item para optin")
      }

      console.log("[v0] Item activated, waiting for ML to process...")
      // Esperar 2 segundos para que ML procese el cambio de estado
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Verificar que realmente se activó
      const verifyResponse = await fetch(`https://api.mercadolibre.com/items/${mlItemId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (verifyResponse.ok) {
        const verifyData = await verifyResponse.json()
        console.log("[v0] Item status after activate:", verifyData.status)
        if (verifyData.status === "paused") {
          console.error("[v0] Item still paused, skipping optin")
          throw new Error("Item sigue pausado después de activar")
        }
      }
    }

    const optinResponse = await fetch("https://api.mercadolibre.com/items/catalog_listings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        item_id: mlItemId,
        catalog_product_id: catalogProductId,
      }),
    })

    if (optinResponse.ok) {
      return await optinResponse.json()
    }

    const optinError = await optinResponse.json()
    console.error("Error en optin catalogo:", optinError)
    return null
  } catch (optinErr) {
    console.error("Error al vincular con catalogo:", optinErr)
    return null
  }
}

// ─── DB persistence ───────────────────────────────────────────────────────────

export async function savePublication(params: {
  supabase: SupabaseClient
  productId: string
  accountId: string
  mlData: any
}): Promise<void> {
  const { supabase, productId, accountId, mlData } = params

  const { error: insertError } = await supabase.from("ml_publications").insert({
    product_id: productId,
    account_id: accountId,
    ml_item_id: mlData.id,
    title: mlData.title,
    price: mlData.price,
    status: mlData.status,
    permalink: mlData.permalink,
    published_at: new Date().toISOString(),
  })

  if (insertError) {
    console.error("Error saving publication:", insertError)
  }
}

export async function saveCatalogPublication(params: {
  supabase: SupabaseClient
  productId: string
  accountId: string
  catalogListing: any
  fallbackTitle: string
  fallbackPrice: number
}): Promise<void> {
  const { supabase, productId, accountId, catalogListing, fallbackTitle, fallbackPrice } = params

  if (catalogListing.id) {
    await supabase.from("ml_publications").insert({
      product_id: productId,
      account_id: accountId,
      ml_item_id: catalogListing.id,
      title: catalogListing.title || fallbackTitle,
      price: catalogListing.price || fallbackPrice,
      status: catalogListing.status || "active",
      permalink: catalogListing.permalink,
      published_at: new Date().toISOString(),
    })
  }
}

export async function updateProductMlStatus(params: {
  supabase: SupabaseClient
  productId: string
  accountId: string
  mlData: any
}): Promise<void> {
  const { supabase, productId, accountId, mlData } = params

  await supabase
    .from("products")
    .update({
      ml_item_id: mlData.id,
      ml_account_id: accountId,
      ml_status: mlData.status || "active",
      ml_published_at: new Date().toISOString(),
      ml_permalink: mlData.permalink,
    })
    .eq("id", productId)
}

// ─── DB loading ───────────────────────────────────────────────────────────────

export interface PublishContext {
  product: any
  template: any
  account: any
  marginPercent: number
  accessToken: string
  validAccount: any
}

/**
 * Loads product, template (with price profile margin), and ML account from DB.
 * Refreshes the ML access token. Returns either the context or an error payload.
 */
export async function loadPublishContext(params: {
  supabase: SupabaseClient
  productId: string
  templateId: string
  accountId: string
  refreshTokenFn: (account: any) => Promise<any>
}): Promise<{ ok: true; ctx: PublishContext } | { ok: false; status: number; body: Record<string, unknown> }> {
  const { supabase, productId, templateId, accountId, refreshTokenFn } = params

  // Load product
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single()

  if (productError || !product) {
    const errorMsg = productError?.message || ""
    const isRateLimit = errorMsg.includes("Too Many") || errorMsg.includes("rate") || errorMsg.includes("429")
    console.log("[v0] Product error for id:", productId, "Error:", productError, "IsRateLimit:", isRateLimit)
    return {
      ok: false,
      status: isRateLimit ? 429 : 404,
      body: {
        success: false,
        error: isRateLimit
          ? "Demasiadas solicitudes. Intenta más lento."
          : `No existe en BD (ID: ${String(productId).slice(0, 8)}...)`,
        product_id_received: productId,
        db_error: errorMsg,
        is_rate_limit: isRateLimit,
      },
    }
  }

  console.log("[v0] Product loaded from DB:", {
    id: product.id,
    title: product.title,
    image_url: product.image_url,
    description: product.description?.substring(0, 100) + "...",
  })

  // Load template
  const { data: template, error: templateError } = await supabase
    .from("ml_publication_templates")
    .select("*")
    .eq("id", templateId)
    .single()

  if (templateError || !template) {
    return { ok: false, status: 404, body: { success: false, error: "Plantilla no encontrada" } }
  }

  // Resolve margin from price profile
  let marginPercent = template.margin_percent || 20
  if (template.price_profile_id) {
    const { data: priceProfile } = await supabase
      .from("price_profiles")
      .select("margin_percent")
      .eq("id", template.price_profile_id)
      .single()
    if (priceProfile) {
      marginPercent = Number(priceProfile.margin_percent)
      console.log("[v0] Using margin from price profile:", marginPercent, "%")
    }
  }

  // Load ML account
  const { data: account, error: accountError } = await supabase
    .from("ml_accounts")
    .select("*")
    .eq("id", accountId)
    .single()

  if (accountError || !account) {
    return { ok: false, status: 404, body: { success: false, error: "Cuenta ML no encontrada" } }
  }

  const validAccount = (await refreshTokenFn(account)) as any
  const accessToken = validAccount.access_token

  return { ok: true, ctx: { product, template, account, marginPercent, accessToken, validAccount } }
}

// ─── Margin calculation ───────────────────────────────────────────────────────

export function calculateActualMargin(params: {
  finalPrice: number
  priceCalculation: { shippingCost?: number; fixedFee?: number; costInArs?: number; exchangeRate?: number } | null
  costPrice: number
}): number {
  const { finalPrice, priceCalculation, costPrice } = params
  const mlCommission = finalPrice * 0.13
  const shippingCostFinal = priceCalculation?.shippingCost || 0
  const fixedFeeFinal = priceCalculation?.fixedFee || 0
  const netReceived = finalPrice - mlCommission - shippingCostFinal - fixedFeeFinal
  const costInArs = priceCalculation?.costInArs || costPrice * 1765
  return ((netReceived - costInArs) / costInArs) * 100
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export function buildWarnings(params: {
  imageWarning: string | null
  sellerSkuAdded: boolean
  sellerSkuValue: string | null
  descriptionAdded: boolean
  descriptionError: string | null
  publishMode: string
  catalogProductId: string | null
  catalogListing: any | null
}): string[] {
  const {
    imageWarning,
    sellerSkuAdded,
    sellerSkuValue,
    descriptionAdded,
    descriptionError,
    publishMode,
    catalogProductId,
    catalogListing,
  } = params
  const warnings: string[] = []
  if (imageWarning) warnings.push(`Imagen: ${imageWarning}`)
  if (!sellerSkuAdded && sellerSkuValue) warnings.push("SKU no pudo agregarse al listing")
  if (!descriptionAdded) warnings.push(`Descripción no agregada${descriptionError ? `: ${descriptionError}` : ""}`)
  if (publishMode === "linked" && catalogProductId && !catalogListing)
    warnings.push("Catalog opt-in falló, publicado solo como listing tradicional")
  return warnings
}

export {
  resolveProductImage,
  buildMlTitle,
  buildMlDescription,
  buildTraditionalItem,
  buildCatalogItem,
  validateTraditionalItem,
}
