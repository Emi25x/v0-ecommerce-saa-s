// Sync utilities for cross-platform product management

import type { ShopifyProduct } from "./shopify"
import type { MLProduct } from "./mercadolibre"

export interface UnifiedProduct {
  id: string
  title: string
  description: string
  price: number
  inventory: number
  sku?: string
  images: string[]
  platforms: {
    shopify?: {
      id: string
      variantId: string
    }
    mercadolibre?: {
      id: string
    }
  }
}

/**
 * Convert Shopify product to unified format
 */
export function shopifyToUnified(product: ShopifyProduct): UnifiedProduct {
  const variant = product.variants[0]
  return {
    id: `shopify_${product.id}`,
    title: product.title,
    description: product.body_html,
    price: Number.parseFloat(variant?.price || "0"),
    inventory: variant?.inventory_quantity || 0,
    sku: variant?.sku,
    images: product.images.map((img) => img.src),
    platforms: {
      shopify: {
        id: product.id,
        variantId: variant?.id || "",
      },
    },
  }
}

/**
 * Convert Mercado Libre product to unified format
 */
export function mercadolibreToUnified(product: MLProduct): UnifiedProduct {
  return {
    id: `ml_${product.id}`,
    title: product.title,
    description: "",
    price: product.price,
    inventory: product.available_quantity,
    images: product.thumbnail ? [product.thumbnail] : [],
    platforms: {
      mercadolibre: {
        id: product.id,
      },
    },
  }
}

/**
 * Merge products from different platforms
 * This would typically use SKU or other identifiers to match products
 */
export function mergeProducts(shopifyProducts: UnifiedProduct[], mlProducts: UnifiedProduct[]): UnifiedProduct[] {
  const merged = new Map<string, UnifiedProduct>()

  // Add all Shopify products
  for (const product of shopifyProducts) {
    merged.set(product.sku || product.id, product)
  }

  // Merge or add Mercado Libre products
  for (const product of mlProducts) {
    const existing = product.sku ? merged.get(product.sku) : null

    if (existing) {
      // Merge platforms
      existing.platforms.mercadolibre = product.platforms.mercadolibre
      merged.set(product.sku || product.id, existing)
    } else {
      merged.set(product.sku || product.id, product)
    }
  }

  return Array.from(merged.values())
}

/**
 * Calculate sync differences between platforms
 */
export function calculateSyncDiff(unified: UnifiedProduct) {
  const diffs: Array<{
    field: string
    shopify?: any
    mercadolibre?: any
  }> = []

  // This would compare values across platforms and identify differences
  // For now, it's a placeholder for the sync logic

  return diffs
}
