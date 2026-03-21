/**
 * Unified price resolution for any sales channel.
 *
 * Pipeline: pricing engine (product_prices) → legacy fallback
 *
 * This helper is ADDITIVE and SAFE — it never removes existing pricing logic.
 * If the pricing engine can't resolve a price, it falls back transparently
 * to whatever mechanism each channel was using before.
 *
 * Usage:
 *   const result = await resolveProductPriceForChannel(supabase, {
 *     product,
 *     channel: "shopify",
 *     entityId: storeId,
 *     priceListId: store.price_list_id,   // optional shortcut
 *   })
 *   // result.price — the resolved price (number)
 *   // result.price_mode — how the price was resolved
 */

import { createStructuredLogger, genRequestId } from "@/lib/logger"
import type { SupabaseClient } from "@supabase/supabase-js"

// ── Types ──────────────────────────────────────────────────────────────────

export type PriceMode =
  | "pricing_engine"          // resolved via product_prices (from domains/pricing/engine.ts)
  | "legacy_store_source"     // Shopify: used store.price_source config (products.price or custom_fields)
  | "legacy_product_field"    // used products.price directly
  | "legacy_ml_calculator"    // ML: used calculateMlPrice() from price-calculator.ts
  | "legacy_override"         // ML: user-supplied override_price
  | "fallback_zero"           // nothing worked, returned 0

export type ChannelType = "shopify" | "ml" | "web" | "mayorista"

export interface ResolvePriceInput {
  /** The product row (must include at least: id, price, cost_price, custom_fields) */
  product: {
    id: string
    price?: number | null
    cost_price?: number | null
    pvp_editorial?: number | null
    custom_fields?: Record<string, unknown> | null
  }
  /** Sales channel */
  channel: ChannelType
  /** Entity ID within the channel (e.g. shopify_store.id, ml_account.id) */
  entityId?: string
  /**
   * Direct price_list_id override — skips assignment lookup.
   * Use when the caller already knows which price list to use
   * (e.g. from shopify_stores.price_list_id or sync params).
   */
  priceListId?: string | null
}

export interface ResolvePriceResult {
  /** Resolved price as a number */
  price: number
  /** How the price was determined */
  price_mode: PriceMode
  /** If pricing_engine was used, the price_list_id */
  price_list_id?: string
  /** Why fallback was used (only set when price_mode != pricing_engine) */
  fallback_reason?: string
}

// ── Entity type mapping ────────────────────────────────────────────────────

const CHANNEL_ENTITY_TYPE: Record<ChannelType, string> = {
  shopify: "shopify_store",
  ml: "ml_account",
  web: "channel",
  mayorista: "channel",
}

// ── Main resolver ──────────────────────────────────────────────────────────

/**
 * Attempts to resolve price via the pricing engine (product_prices table).
 * Returns { price, price_mode } — always returns a result (never throws).
 *
 * Discovery order:
 * 1. Direct priceListId (if provided by caller)
 * 2. price_list_assignments lookup (by entity_type + entity_id)
 * 3. Returns null if no pricing engine price found (caller handles fallback)
 */
export async function resolveProductPriceForChannel(
  supabase: SupabaseClient,
  input: ResolvePriceInput,
): Promise<ResolvePriceResult | null> {
  const log = createStructuredLogger({ request_id: genRequestId() })
  const { product, channel, entityId, priceListId: directPriceListId } = input

  // ── Step 1: Determine which price_list to query ─────────────────────────
  let priceListId = directPriceListId ?? null

  if (!priceListId && entityId) {
    // Auto-discover via price_list_assignments
    const entityType = CHANNEL_ENTITY_TYPE[channel] ?? channel
    try {
      const { data: assignment } = await supabase
        .from("price_list_assignments")
        .select("price_list_id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (assignment?.price_list_id) {
        priceListId = assignment.price_list_id
      }
    } catch {
      // Table might not exist yet — graceful degradation
    }
  }

  if (!priceListId) {
    log.info("No price list found for channel", "pricing.resolve", {
      channel,
      entity_id: entityId ?? null,
      product_id: product.id,
      fallback_reason: "no_price_list",
    })
    return null // caller handles fallback
  }

  // ── Step 2: Query product_prices ────────────────────────────────────────
  try {
    const { data: pp } = await supabase
      .from("product_prices")
      .select("calculated_price, pricing_base_used, has_warnings, margin_below_min")
      .eq("product_id", product.id)
      .eq("price_list_id", priceListId)
      .maybeSingle()

    if (pp?.calculated_price != null && pp.calculated_price > 0) {
      log.info("Price resolved via pricing engine", "pricing.resolve", {
        channel,
        entity_id: entityId ?? null,
        product_id: product.id,
        price_mode: "pricing_engine",
        price_list_id: priceListId,
        calculated_price: pp.calculated_price,
        pricing_base_used: pp.pricing_base_used,
        has_warnings: pp.has_warnings,
        margin_below_min: pp.margin_below_min,
      })

      return {
        price: Number(pp.calculated_price),
        price_mode: "pricing_engine",
        price_list_id: priceListId,
      }
    }

    // Price list exists but no calculated price for this product
    log.info("No calculated price in product_prices", "pricing.resolve", {
      channel,
      entity_id: entityId ?? null,
      product_id: product.id,
      price_list_id: priceListId,
      fallback_reason: "no_calculated_price",
    })
    return null
  } catch {
    // Table might not exist yet
    log.warn("product_prices query failed", "pricing.resolve", {
      channel,
      product_id: product.id,
      price_list_id: priceListId,
      fallback_reason: "query_error",
    })
    return null
  }
}

// ── Shopify-specific convenience ───────────────────────────────────────────

export interface ShopifyPriceResolutionInput {
  product: ResolvePriceInput["product"]
  store: {
    id: string
    price_source?: string | null
    price_list_id?: string | null
  }
}

/**
 * Shopify-specific price resolver with full fallback chain:
 *   1. Pricing engine (via product_prices)
 *   2. Legacy store.price_source config
 *   3. products.price
 */
export async function resolveShopifyPrice(
  supabase: SupabaseClient,
  input: ShopifyPriceResolutionInput,
): Promise<ResolvePriceResult> {
  const { product, store } = input
  const log = createStructuredLogger({ request_id: genRequestId() })

  // ── Try pricing engine first ────────────────────────────────────────────
  const engineResult = await resolveProductPriceForChannel(supabase, {
    product,
    channel: "shopify",
    entityId: store.id,
    priceListId: store.price_list_id,
  })

  if (engineResult) return engineResult

  // ── Fallback: legacy store.price_source ─────────────────────────────────
  const cf = (product.custom_fields as Record<string, unknown>) ?? {}

  // Legacy path 1: product_prices (already tried via engine, but store might
  // have price_source=product_prices with a price_list_id not in assignments)
  if (store.price_source === "product_prices" && store.price_list_id) {
    try {
      const { data: pp } = await supabase
        .from("product_prices")
        .select("calculated_price")
        .eq("product_id", product.id)
        .eq("price_list_id", store.price_list_id)
        .maybeSingle()

      if (pp?.calculated_price != null) {
        log.info("Price resolved via legacy store price_source=product_prices", "pricing.resolve", {
          channel: "shopify",
          product_id: product.id,
          store_id: store.id,
          price_mode: "legacy_store_source",
          price: pp.calculated_price,
        })
        return {
          price: Number(pp.calculated_price),
          price_mode: "legacy_store_source",
          fallback_reason: "pricing_engine_miss_legacy_product_prices",
        }
      }
    } catch {
      // Continue to next fallback
    }
  }

  // Legacy path 2: custom_fields.precio_ars
  if (store.price_source === "custom_fields_precio_ars") {
    const arsPrice = Number(cf.precio_ars)
    if (arsPrice > 0) {
      log.info("Price resolved via legacy custom_fields_precio_ars", "pricing.resolve", {
        channel: "shopify",
        product_id: product.id,
        store_id: store.id,
        price_mode: "legacy_store_source",
        price: arsPrice,
      })
      return {
        price: arsPrice,
        price_mode: "legacy_store_source",
        fallback_reason: "store_price_source_custom_fields",
      }
    }
  }

  // Legacy path 3: products.price (default)
  const basePrice = Number(product.price ?? 0)
  log.info("Price resolved via legacy product.price", "pricing.resolve", {
    channel: "shopify",
    product_id: product.id,
    store_id: store.id,
    price_mode: "legacy_product_field",
    price: basePrice,
  })

  return {
    price: basePrice,
    price_mode: "legacy_product_field",
    fallback_reason: "no_engine_price_using_product_price",
  }
}

// ── ML-specific convenience ────────────────────────────────────────────────

export interface MlPriceResolutionInput {
  product: ResolvePriceInput["product"]
  accountId: string
  priceListId?: string | null
}

/**
 * ML-specific price resolver — only attempts pricing engine lookup.
 * Returns null if no engine price, letting the caller use its own
 * legacy calculator (calculateMlPrice, override_price, etc.)
 */
export async function resolveMlEnginePrice(
  supabase: SupabaseClient,
  input: MlPriceResolutionInput,
): Promise<ResolvePriceResult | null> {
  return resolveProductPriceForChannel(supabase, {
    product: input.product,
    channel: "ml",
    entityId: input.accountId,
    priceListId: input.priceListId,
  })
}
