// Shopify API client (moved from lib/shopify.ts)

export interface ShopifyProduct {
  id: string
  title: string
  body_html: string
  vendor: string
  product_type: string
  handle: string
  status: string
  images: Array<{ src: string }>
  variants: Array<{
    id: string
    sku: string
    price: string
    inventory_quantity: number
  }>
}

export async function getShopifyProducts(): Promise<ShopifyProduct[]> {
  throw new Error("Shopify client not implemented")
}

export async function createShopifyProduct(product: any): Promise<{ id: string }> {
  throw new Error("Shopify client not implemented")
}

export async function updateShopifyProduct(id: string, updates: any): Promise<void> {
  throw new Error("Shopify client not implemented")
}

export async function updateShopifyVariantInventory(variantId: string, quantity: number): Promise<void> {
  throw new Error("Shopify client not implemented")
}

export function isShopifyConfigured(): boolean {
  return !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN)
}
