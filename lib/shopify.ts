// Shopify API client and utilities

export interface ShopifyProduct {
  id: string
  title: string
  body_html: string
  vendor: string
  product_type: string
  created_at: string
  handle: string
  updated_at: string
  published_at: string
  status: string
  variants: ShopifyVariant[]
  images: ShopifyImage[]
}

export interface ShopifyVariant {
  id: string
  product_id: string
  title: string
  price: string
  sku: string
  inventory_quantity: number
  inventory_management: string
}

export interface ShopifyImage {
  id: string
  product_id: string
  src: string
  alt: string | null
}

/**
 * Check if Shopify is configured
 */
export function isShopifyConfigured(): boolean {
  return !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN)
}

/**
 * Get Shopify API URL
 */
function getShopifyApiUrl(): string {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN
  if (!storeDomain) {
    throw new Error("SHOPIFY_STORE_DOMAIN not configured")
  }
  return `https://${storeDomain}/admin/api/2024-01/graphql.json`
}

/**
 * Get Shopify access token
 */
function getShopifyAccessToken(): string {
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error("SHOPIFY_ACCESS_TOKEN not configured")
  }
  return accessToken
}

/**
 * Make a GraphQL request to Shopify
 */
async function shopifyGraphQL(query: string, variables?: Record<string, any>) {
  const response = await fetch(getShopifyApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": getShopifyAccessToken(),
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  })

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.statusText}`)
  }

  const data = await response.json()

  if (data.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(data.errors)}`)
  }

  return data.data
}

/**
 * Get all products from Shopify
 */
export async function getShopifyProducts(): Promise<ShopifyProduct[]> {
  if (!isShopifyConfigured()) {
    return []
  }

  const query = `
    query GetProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            descriptionHtml
            vendor
            productType
            createdAt
            handle
            updatedAt
            publishedAt
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price
                  sku
                  inventoryQuantity
                }
              }
            }
            images(first: 10) {
              edges {
                node {
                  id
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  `

  const data = await shopifyGraphQL(query, { first: 250 })

  return data.products.edges.map((edge: any) => ({
    id: edge.node.id,
    title: edge.node.title,
    body_html: edge.node.descriptionHtml,
    vendor: edge.node.vendor,
    product_type: edge.node.productType,
    created_at: edge.node.createdAt,
    handle: edge.node.handle,
    updated_at: edge.node.updatedAt,
    published_at: edge.node.publishedAt,
    status: edge.node.status,
    variants: edge.node.variants.edges.map((v: any) => ({
      id: v.node.id,
      product_id: edge.node.id,
      title: v.node.title,
      price: v.node.price,
      sku: v.node.sku,
      inventory_quantity: v.node.inventoryQuantity,
    })),
    images: edge.node.images.edges.map((i: any) => ({
      id: i.node.id,
      product_id: edge.node.id,
      src: i.node.url,
      alt: i.node.altText,
    })),
  }))
}

/**
 * Create a new product on Shopify
 */
export async function createShopifyProduct(product: {
  title: string
  body_html: string
  vendor: string
  product_type: string
  variants: Array<{
    price: string
    sku?: string
    inventory_quantity?: number
  }>
}) {
  const mutation = `
    mutation CreateProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  const input = {
    title: product.title,
    descriptionHtml: product.body_html,
    vendor: product.vendor,
    productType: product.product_type,
    variants: product.variants.map((v) => ({
      price: v.price,
      sku: v.sku,
      inventoryQuantity: v.inventory_quantity,
    })),
  }

  const data = await shopifyGraphQL(mutation, { input })

  if (data.productCreate.userErrors.length > 0) {
    throw new Error(`Failed to create product: ${JSON.stringify(data.productCreate.userErrors)}`)
  }

  return data.productCreate.product
}

/**
 * Update an existing product on Shopify
 */
export async function updateShopifyProduct(
  productId: string,
  updates: {
    title?: string
    body_html?: string
    vendor?: string
    product_type?: string
  },
) {
  const mutation = `
    mutation UpdateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  const input = {
    id: productId,
    ...(updates.title && { title: updates.title }),
    ...(updates.body_html && { descriptionHtml: updates.body_html }),
    ...(updates.vendor && { vendor: updates.vendor }),
    ...(updates.product_type && { productType: updates.product_type }),
  }

  const data = await shopifyGraphQL(mutation, { input })

  if (data.productUpdate.userErrors.length > 0) {
    throw new Error(`Failed to update product: ${JSON.stringify(data.productUpdate.userErrors)}`)
  }

  return data.productUpdate.product
}

/**
 * Update variant inventory
 */
export async function updateShopifyVariantInventory(variantId: string, quantity: number) {
  const mutation = `
    mutation UpdateInventory($input: InventoryAdjustQuantityInput!) {
      inventoryAdjustQuantity(input: $input) {
        inventoryLevel {
          id
          available
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  // First, get the inventory item ID
  const variantQuery = `
    query GetVariant($id: ID!) {
      productVariant(id: $id) {
        inventoryItem {
          id
        }
      }
    }
  `

  const variantData = await shopifyGraphQL(variantQuery, { id: variantId })
  const inventoryItemId = variantData.productVariant.inventoryItem.id

  const input = {
    inventoryItemId,
    availableDelta: quantity,
  }

  const data = await shopifyGraphQL(mutation, { input })

  if (data.inventoryAdjustQuantity.userErrors.length > 0) {
    throw new Error(`Failed to update inventory: ${JSON.stringify(data.inventoryAdjustQuantity.userErrors)}`)
  }

  return data.inventoryAdjustQuantity.inventoryLevel
}

/**
 * Update variant price
 */
export async function updateShopifyVariantPrice(variantId: string, price: string) {
  const mutation = `
    mutation UpdateVariant($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant {
          id
          price
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  const input = {
    id: variantId,
    price,
  }

  const data = await shopifyGraphQL(mutation, { input })

  if (data.productVariantUpdate.userErrors.length > 0) {
    throw new Error(`Failed to update variant price: ${JSON.stringify(data.productVariantUpdate.userErrors)}`)
  }

  return data.productVariantUpdate.productVariant
}
