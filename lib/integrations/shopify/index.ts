// Shopify integration following the new modular architecture

import type { BaseIntegration, IntegrationConfig, UnifiedProduct } from "../types"
import * as shopifyClient from "./client"

export class ShopifyIntegration implements BaseIntegration {
  config: IntegrationConfig = {
    metadata: {
      id: "shopify",
      name: "Shopify",
      description: "Plataforma de e-commerce líder mundial",
      icon: "🛍️",
      color: "#96bf48",
      website: "https://www.shopify.com",
      docsUrl: "https://shopify.dev/docs",
    },
    auth: {
      type: "api_token",
      required: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ACCESS_TOKEN"],
      tokenStorage: undefined,
    },
    capabilities: {
      source: {
        enabled: true,
        supportsImport: true,
        supportsPagination: true,
        supportsFilters: false,
        supportsWebhooks: true,
      },
      destination: {
        enabled: true,
        supportsCreate: true,
        supportsUpdate: true,
        supportsDelete: false,
        supportsBulk: false,
      },
      stockSync: {
        enabled: true,
        direction: "bidirectional",
        supportsRealtime: false,
        supportsBatch: false,
      },
      orders: {
        enabled: false,
        supportsCreate: false,
        supportsUpdate: false,
        supportsTracking: false,
        supportsWebhooks: false,
      },
    },
    endpoints: {
      test: "/api/integrations/shopify/test",
      products: "/api/integrations/shopify/products",
      stock: "/api/integrations/shopify/stock",
    },
  }

  isConfigured(): boolean {
    return shopifyClient.isShopifyConfigured()
  }

  async testConnection(): Promise<boolean> {
    try {
      await shopifyClient.getShopifyProducts()
      return true
    } catch {
      return false
    }
  }

  async getProducts(params?: {
    page?: number
    pageSize?: number
  }): Promise<{ products: UnifiedProduct[]; total: number }> {
    const shopifyProducts = await shopifyClient.getShopifyProducts()
    const unified = shopifyProducts.map((p: any) => this.toUnified(p))
    return { products: unified, total: unified.length }
  }

  async createProduct(product: UnifiedProduct): Promise<{ id: string }> {
    const shopifyProduct = this.fromUnified(product)
    const created = await shopifyClient.createShopifyProduct(shopifyProduct)
    return { id: created.id }
  }

  async updateProduct(id: string, updates: Partial<UnifiedProduct>): Promise<void> {
    const shopifyUpdates = this.fromUnifiedPartial(updates)
    await shopifyClient.updateShopifyProduct(id, shopifyUpdates)
  }

  async updateStock(sku: string, quantity: number): Promise<void> {
    // Find variant by SKU and update
    const products = await shopifyClient.getShopifyProducts()
    for (const product of products) {
      const variant = product.variants.find((v: any) => v.sku === sku)
      if (variant) {
        await shopifyClient.updateShopifyVariantInventory(variant.id, quantity)
        return
      }
    }
    throw new Error(`Product with SKU ${sku} not found`)
  }

  private toUnified(shopifyProduct: shopifyClient.ShopifyProduct): UnifiedProduct {
    const variant = shopifyProduct.variants[0]
    return {
      id: shopifyProduct.id,
      sku: variant?.sku,
      title: shopifyProduct.title,
      description: shopifyProduct.body_html,
      price: Number.parseFloat(variant?.price || "0"),
      inventory: variant?.inventory_quantity || 0,
      images: shopifyProduct.images.map((img: any) => img.src),
      brand: shopifyProduct.vendor,
      category: shopifyProduct.product_type,
      active: shopifyProduct.status === "active",
      platformData: {
        shopify: {
          productId: shopifyProduct.id,
          variantId: variant?.id,
          handle: shopifyProduct.handle,
        },
      },
    }
  }

  private fromUnified(product: UnifiedProduct): any {
    return {
      title: product.title,
      body_html: product.description || "",
      vendor: product.brand || "",
      product_type: product.category || "",
      variants: [
        {
          price: product.price.toString(),
          sku: product.sku,
          inventory_quantity: product.inventory,
        },
      ],
    }
  }

  private fromUnifiedPartial(updates: Partial<UnifiedProduct>): any {
    const result: any = {}
    if (updates.title) result.title = updates.title
    if (updates.description) result.body_html = updates.description
    if (updates.brand) result.vendor = updates.brand
    if (updates.category) result.product_type = updates.category
    return result
  }
}

// Register the integration
import { integrationRegistry } from "../registry"
integrationRegistry.register(new ShopifyIntegration())
