// Mercado Libre API client and utilities

import { createStructuredLogger } from "@/lib/logger"

const log = createStructuredLogger({})

const ML_API_BASE = "https://api.mercadolibre.com"

export interface MLProduct {
  id: string
  title: string
  price: number
  available_quantity: number
  thumbnail: string
  permalink: string
  status: string
  condition: string
  currency_id: string
  catalog_listing?: boolean
  tags?: string[]
  listing_type_id?: string
  sale_terms?: Array<{ id: string; value_name: string; value_id?: string }>
  shipping?: {
    mode: string
    free_shipping: boolean
    logistic_type?: string
  }
  SELLER_SKU?: string // Changed from seller_custom_field to SELLER_SKU (correct ML API field)
}

export interface MLAuthTokens {
  access_token: string
  refresh_token: string
  expires_in: number
}

/**
 * Generate a random code verifier for PKCE
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

/**
 * Generate code challenge from verifier
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return base64UrlEncode(new Uint8Array(hash))
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array))
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

/**
 * Get authorization URL for Mercado Libre OAuth with PKCE
 */
export function getMercadoLibreAuthUrl(redirectUri: string, codeChallenge: string, state = ""): string {
  const clientId = process.env.MERCADOLIBRE_CLIENT_ID
  if (!clientId) {
    throw new Error("MERCADOLIBRE_CLIENT_ID not configured")
  }

  const encodedRedirectUri = encodeURIComponent(redirectUri)
  const scope = encodeURIComponent("offline_access read write")
  const encodedChallenge = encodeURIComponent(codeChallenge)

  let authUrl = `https://auth.mercadolibre.com/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodedRedirectUri}&scope=${scope}&code_challenge=${encodedChallenge}&code_challenge_method=S256`
  if (state) authUrl += `&state=${state}`

  return authUrl
}

/**
 * Exchange authorization code for access token with PKCE
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<MLAuthTokens> {
  const clientId = process.env.MERCADOLIBRE_CLIENT_ID
  const clientSecret = process.env.MERCADOLIBRE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Mercado Libre credentials not configured")
  }

  log.info("Token exchange started", "ml.token_exchange")

  const body = {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  }

  const response = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    log.error("Token exchange failed", new Error(errorText), "ml.token_exchange", {
      status: response.status,
    })
    throw new Error(`Failed to exchange code: ${response.status} - ${errorText}`)
  }

  const tokens = await response.json()
  log.info("Token exchange successful", "ml.token_exchange", { status: "ok" })
  return tokens
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<MLAuthTokens> {
  const clientId = process.env.MERCADOLIBRE_CLIENT_ID
  const clientSecret = process.env.MERCADOLIBRE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Mercado Libre credentials not configured")
  }

  const response = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to refresh token: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Refresh token if needed - takes an account object and returns it with a valid token
 * This is useful when you already have the account object from the database
 */
export async function refreshTokenIfNeeded(account: {
  id: string
  access_token: string
  refresh_token: string
  token_expires_at: string
}): Promise<{ id: string; access_token: string; refresh_token: string; token_expires_at: string }> {
  const { createClient } = await import("@/lib/db/server")
  const supabase = await createClient()

  // Check if token is expired or will expire in the next 5 minutes
  const expiresAt = new Date(account.token_expires_at)
  const now = new Date()
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

  if (expiresAt > fiveMinutesFromNow) {
    // Token is still valid
    return account
  }

  // Token is expired or about to expire, refresh it
  log.info("Refreshing expired token", "ml.token_refresh", { account_id: account.id })
  const tokens = await refreshAccessToken(account.refresh_token)

  // Update database with new tokens
  const newExpiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
  await supabase
    .from("ml_accounts")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id)

  log.info("Token refreshed successfully", "ml.token_refresh", { account_id: account.id, status: "ok" })
  return {
    ...account,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: newExpiresAt,
  }
}

/**
 * Get a valid access token for a user, refreshing if necessary
 * This function checks the database for the token and refreshes it if expired
 */
export async function getValidAccessToken(accountId: string): Promise<string> {
  const { createClient } = await import("@/lib/db/server")
  const supabase = await createClient()

  const { data: account, error } = await supabase.from("ml_accounts").select("*").eq("id", accountId).single()

  if (error || !account) {
    log.error("Account not found", error || new Error("not_found"), "ml.get_token", { account_id: accountId })
    throw new Error("MercadoLibre account not found. Please connect your MercadoLibre account first.")
  }

  // Check if token is expired or will expire in the next 5 minutes
  const expiresAt = new Date(account.token_expires_at)
  const now = new Date()
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

  if (expiresAt > fiveMinutesFromNow) {
    // Token is still valid
    return account.access_token
  }

  // Token is expired or about to expire, refresh it
  log.info("Refreshing expired token", "ml.token_refresh", { account_id: accountId })
  const tokens = await refreshAccessToken(account.refresh_token)

  // Update database with new tokens
  const newExpiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
  await supabase
    .from("ml_accounts")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId)

  log.info("Token refreshed successfully", "ml.token_refresh", { account_id: accountId, status: "ok" })
  return tokens.access_token
}

/**
 * Get access token from cookies (helper function)
 * This is a convenience function that gets the userId from cookies and returns a valid access token
 * Note: This can only be used in API routes where cookies are available
 */
export async function getAccessToken(): Promise<string> {
  const { cookies } = await import("next/headers")
  const cookieStore = await cookies()
  const userId = cookieStore.get("ml_user_id")?.value

  if (!userId) {
    throw new Error("Not authenticated - ml_user_id cookie not found")
  }

  return getValidAccessToken(userId)
}

/**
 * Get user's products from Mercado Libre with pagination and filters
 */
export async function getMercadoLibreProducts(
  accessToken: string,
  userId: string,
  limit = 50,
  offset = 0,
  filters?: {
    status?: string
    catalog_listing?: boolean
    catalog_listing_eligible?: boolean
    listing_type?: string
    sort?: string
  },
): Promise<{ products: MLProduct[]; paging: { total: number; limit: number; offset: number } }> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  })

  if (filters?.status) {
    params.append("status", filters.status)
  }

  if (filters?.catalog_listing !== undefined) {
    params.append("catalog_listing", filters.catalog_listing.toString())
  }

  if (filters?.catalog_listing_eligible) {
    params.append("tags", "catalog_listing_eligible")
  }

  if (filters?.listing_type) {
    params.append("listing_type", filters.listing_type)
  }

  if (filters?.sort) {
    params.append("sort", filters.sort)
  }

  const url = `${ML_API_BASE}/users/${userId}/items/search?${params.toString()}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.statusText}`)
  }

  const data = await response.json()
  const itemIds = data.results
  const paging = data.paging

  log.info("Products search completed", "ml.products_search", { total: paging.total, limit, offset })

  if (!itemIds || itemIds.length === 0) {
    return { products: [], paging: { total: 0, limit, offset } }
  }

  const products: MLProduct[] = []
  const batchSize = 20

  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize)
    const productsResponse = await fetch(
      `${ML_API_BASE}/items?ids=${batch.join(",")}&attributes=id,title,price,available_quantity,thumbnail,permalink,status,condition,currency_id,catalog_listing,tags,listing_type_id,sale_terms,shipping,seller_custom_field,attributes`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!productsResponse.ok) {
      log.warn("Failed to fetch product batch", "ml.products_batch", { batch_index: i / batchSize + 1 })
      continue
    }

    const productsData = await productsResponse.json()

    const processedProducts = productsData.map((item: any) => {
      const product = item.body

      let sku = product.seller_custom_field

      if (!sku && product.attributes) {
        const skuAttr = product.attributes.find(
          (attr: any) => attr.id === "SELLER_SKU" || attr.name === "SKU" || attr.id === "SKU",
        )
        if (skuAttr) {
          sku = skuAttr.value_name || skuAttr.value
        }
      }

      return {
        ...product,
        SELLER_SKU: sku,
      }
    })

    products.push(...processedProducts)
  }

  return { products, paging: { total: paging.total, limit, offset } }
}

/**
 * Get user information
 */
export async function getMercadoLibreUser(accessToken: string) {
  const response = await fetch(`${ML_API_BASE}/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Create a new product on Mercado Libre
 */
export async function createMercadoLibreProduct(
  accessToken: string,
  product: {
    title: string
    price: number
    available_quantity: number
    condition: "new" | "used"
    category_id: string
    description: string
  },
) {
  const response = await fetch(`${ML_API_BASE}/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(product),
  })

  if (!response.ok) {
    throw new Error(`Failed to create product: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Update an existing product on Mercado Libre
 */
export async function updateMercadoLibreProduct(
  accessToken: string,
  productId: string,
  updates: {
    title?: string
    price?: number
    available_quantity?: number
    status?: string
    catalog_listing?: boolean
    catalog_product_id?: string // Added catalog_product_id for catalog conversion
    listing_type_id?: string
    sale_terms?: Array<{ id: string; value_name: string }>
    shipping?: {
      mode?: string
      free_shipping?: boolean
      logistic_type?: string
    }
    pictures?: Array<{ source: string }>
    description?: string
  },
) {
  log.info("Updating product", "ml.update_product", { product_id: productId })

  const response = await fetch(`${ML_API_BASE}/items/${productId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  })

  if (!response.ok) {
    const errorText = await response.text()
    log.error("Product update failed", new Error(errorText), "ml.update_product", {
      product_id: productId,
      status: response.status,
    })
    throw new Error(`Failed to update product ${productId}: ${response.status} - ${errorText}`)
  }

  const result = await response.json()
  log.info("Product updated successfully", "ml.update_product", { product_id: productId, status: "ok" })
  return result
}

/**
 * Get product visits and sales metrics
 */
export async function getProductMetrics(accessToken: string, productId: string) {
  const response = await fetch(`${ML_API_BASE}/items/${productId}/visits`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch product metrics: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get product health and recommendations
 */
export async function getProductHealth(accessToken: string, productId: string) {
  const response = await fetch(`${ML_API_BASE}/items/${productId}/health`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    // Health endpoint might not be available for all products
    return null
  }

  return response.json()
}

/**
 * Get user's orders from Mercado Libre
 */
export async function getMercadoLibreOrders(
  accessToken: string,
  userId: string,
  filters?: {
    status?: string
    date_from?: string
    date_to?: string
    limit?: number
    offset?: number
    sort?: string
  },
) {
  const params = new URLSearchParams({
    seller: userId,
    limit: (filters?.limit || 50).toString(),
    offset: (filters?.offset || 0).toString(),
  })

  if (filters?.status) {
    params.append("order.status", filters.status)
  }

  if (filters?.date_from) {
    params.append("order.date_created.from", filters.date_from)
  }

  if (filters?.date_to) {
    params.append("order.date_created.to", filters.date_to)
  }

  if (filters?.sort) {
    params.append("sort", filters.sort)
  } else {
    params.append("sort", "date_desc")
  }

  const response = await fetch(`${ML_API_BASE}/orders/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch orders: ${response.statusText}`)
  }

  const data = await response.json()

  log.info("Orders fetched", "ml.orders_search", {
    count: data.results?.length || 0,
    total: data.paging?.total,
  })

  return data
}

/**
 * Get order details
 */
export async function getOrderDetails(accessToken: string, orderId: string) {
  const response = await fetch(`${ML_API_BASE}/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch order details: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get shipments for a seller from orders
 * Note: ML API doesn't have a direct /shipments/search endpoint
 * Shipments are obtained through orders
 */
export async function getMercadoLibreShipments(
  accessToken: string,
  userId: string,
  filters?: {
    status?: string
    date_from?: string
    date_to?: string
    limit?: number
    offset?: number
  },
) {
  let retries = 0
  const maxRetries = 3
  let lastError: Error | null = null

  while (retries <= maxRetries) {
    try {
      // Add delay before making request to avoid rate limiting
      if (retries > 0) {
        const delay = Math.min(1000 * Math.pow(2, retries), 5000) // Exponential backoff, max 5s
        log.info("Retrying shipments fetch", "ml.shipments", { retry: retries, max: maxRetries, delay_ms: delay })
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      const ordersData = await getMercadoLibreOrders(accessToken, userId, filters)

      // Extraer shipments de las órdenes
      const shipments = ordersData.results
        .filter((order: any) => order.shipping && order.shipping.id)
        .map((order: any) => {
          const shipping = order.shipping || {}

          const hasLabel =
            shipping.status === "ready_to_ship" || shipping.status === "shipped" || shipping.status === "delivered"

          return {
            id: shipping.id,
            order_id: order.id,
            status: shipping.status || "unknown",
            substatus: shipping.substatus || "",
            tracking_number: shipping.tracking_number || null,
            tracking_method: shipping.tracking_method || null,
            date_created: shipping.date_created || order.date_created || new Date().toISOString(),
            last_updated: shipping.last_updated || order.last_updated || new Date().toISOString(),
            date_first_printed: shipping.date_first_printed || null,
            receiver_address: shipping.receiver_address || null,
            sender_address: shipping.sender_address || null,
            shipment_type: shipping.shipment_type || null,
            shipping_mode: shipping.shipping_mode || null,
            shipping_option: shipping.shipping_option || null,
            cost: shipping.cost || 0,
            base_cost: shipping.base_cost || 0,
            status_history: shipping.status_history || {},
            has_label: hasLabel,
            buyer: order.buyer || {},
            items: order.order_items || [],
            total_amount: order.total_amount || 0,
          }
        })

      return {
        results: shipments,
        paging: ordersData.paging,
      }
    } catch (error: any) {
      lastError = error
      const errorMessage = error.message || String(error)

      if (errorMessage.includes("Too Many") || errorMessage.includes("429")) {
        log.warn("Rate limit hit on shipments", "ml.shipments", { attempt: retries + 1, max: maxRetries + 1 })
        retries++
        if (retries <= maxRetries) {
          continue // Retry
        }
      }

      throw error
    }
  }

  throw lastError || new Error("Failed to fetch shipments after multiple retries")
}

/**
 * Get shipment details
 */
export async function getShipmentDetails(accessToken: string, shipmentId: string) {
  const response = await fetch(`${ML_API_BASE}/shipments/${shipmentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch shipment details: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get shipping label PDF
 */
export async function getShippingLabel(accessToken: string, shipmentId: string) {
  const response = await fetch(`${ML_API_BASE}/shipment_labels?shipment_ids=${shipmentId}&response_type=pdf`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch shipping label: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Search for Product Ads campaigns
 */
export async function getProductAdsCampaigns(accessToken: string, userId: string) {
  const response = await fetch(`${ML_API_BASE}/advertising/campaigns?advertiser_id=${userId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch campaigns: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Create a Product Ads campaign
 */
export async function createProductAdsCampaign(
  accessToken: string,
  campaign: {
    name: string
    product_ids: string[]
    daily_budget: number
    bid_amount: number
  },
) {
  const response = await fetch(`${ML_API_BASE}/advertising/campaigns`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(campaign),
  })

  if (!response.ok) {
    const errorText = await response.text()
    log.error("Failed to create campaign", new Error(errorText), "ml.create_campaign")
    throw new Error(`Failed to create campaign: ${errorText}`)
  }

  return response.json()
}
