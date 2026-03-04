// Mercado Libre API client and utilities

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
  const scope              = encodeURIComponent("offline_access read write")
  const encodedChallenge   = encodeURIComponent(codeChallenge)

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

  console.log("[v0] ML Token Exchange - Code:", code.substring(0, 10) + "...")
  console.log("[v0] ML Token Exchange - Redirect URI:", redirectUri)
  console.log("[v0] ML Token Exchange - Code Verifier:", codeVerifier.substring(0, 10) + "...")

  const body = {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  }

  console.log("[v0] ML Token Exchange - Request body:", { ...body, client_secret: "***", code_verifier: "***" })

  const response = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error("[v0] ML Token Exchange - Error response:", errorText)
    throw new Error(`Failed to exchange code: ${response.status} - ${errorText}`)
  }

  const tokens = await response.json()
  console.log("[v0] ML Token Exchange - Success!")
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
  const { createClient } = await import("@/lib/supabase/server")
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
  console.log("[v0] ML Token - Refreshing expired token for account:", account.id)
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

  console.log("[v0] ML Token - Refreshed successfully")
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
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()
  
  const { data: account, error } = await supabase.from("ml_accounts").select("*").eq("id", accountId).single()
  
  if (error || !account) {
  console.error("[v0] ML Token - Account not found for account_id:", accountId, error)
  throw new Error("MercadoLibre account not found. Please connect your MercadoLibre account first.")
  }

  console.log("[v0] ML Token - Account found:", account.id)

  // Check if token is expired or will expire in the next 5 minutes
  const expiresAt = new Date(account.token_expires_at)
  const now = new Date()
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

  if (expiresAt > fiveMinutesFromNow) {
    // Token is still valid
    console.log("[v0] ML Token - Using existing valid token")
    return account.access_token
  }

  // Token is expired or about to expire, refresh it
  console.log("[v0] ML Token - Refreshing expired token")
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

  console.log("[v0] ML Token - Refreshed successfully")
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
  console.log("[v0] ML Products - Fetching with filters:", url)

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

  console.log("[v0] ML Products - Total:", paging.total, "Limit:", limit, "Offset:", offset)

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
      console.error(`[v0] Failed to fetch batch ${i / batchSize + 1}`)
      continue
    }

    const productsData = await productsResponse.json()
    console.log("[v0] Sample product from API (full):", JSON.stringify(productsData[0]?.body, null, 2))

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

      console.log("[v0] Product SKU extraction:", {
        id: product.id,
        seller_custom_field: product.seller_custom_field,
        extracted_sku: sku,
      })

      return {
        ...product,
        SELLER_SKU: sku,
      }
    })

    products.push(...processedProducts)
  }

  console.log("[v0] Final products sample with SKU:", products[0])

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
  console.log("[v0] ML Update Product - ID:", productId)
  console.log("[v0] ML Update Product - Updates:", JSON.stringify(updates, null, 2))

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
    console.error("[v0] ML Update Product - Error:", errorText)
    throw new Error(`Failed to update product ${productId}: ${response.status} - ${errorText}`)
  }

  const result = await response.json()
  console.log("[v0] ML Update Product - Success")
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

  console.log("[v0] ===== ANÁLISIS DE TODAS LAS ÓRDENES =====")
  console.log("[v0] Total de órdenes:", data.results?.length || 0)

  if (data.results && data.results.length > 0) {
    data.results.forEach((order: any, index: number) => {
      console.log(`\n[v0] --- ORDEN ${index + 1}/${data.results.length} ---`)
      console.log("[v0] ID:", order.id)
      console.log("[v0] Status:", order.status)
      console.log("[v0] Tags:", JSON.stringify(order.tags))
      console.log("[v0] Date created:", order.date_created)
      console.log("[v0] Manufacturing ending date:", order.manufacturing_ending_date)

      // Datos de shipping
      if (order.shipping) {
        console.log("[v0] SHIPPING DATA:")
        console.log("[v0]   - id:", order.shipping.id)
        console.log("[v0]   - mode:", order.shipping.mode)
        console.log("[v0]   - shipping_mode:", order.shipping.shipping_mode)
        console.log("[v0]   - logistic_type:", order.shipping.logistic_type)
        console.log("[v0]   - status:", order.shipping.status)
        console.log("[v0]   - substatus:", order.shipping.substatus)

        if (order.shipping.shipping_option) {
          console.log("[v0]   - shipping_option.id:", order.shipping.shipping_option.id)
          console.log("[v0]   - shipping_option.name:", order.shipping.shipping_option.name)
          console.log("[v0]   - shipping_option.shipping_method_id:", order.shipping.shipping_option.shipping_method_id)
        }

        if (order.shipping.logistic) {
          console.log("[v0]   - logistic.mode:", order.shipping.logistic.mode)
          console.log("[v0]   - logistic.type:", order.shipping.logistic.type)
        }
      } else {
        console.log("[v0] SHIPPING DATA: null")
      }

      // Resaltar la orden problemática
      if (order.id === 2000013158887752) {
        console.log("[v0] ⚠️  ESTA ES LA ORDEN PROBLEMÁTICA ⚠️")
      }
    })

    console.log("\n[v0] ===== FIN DEL ANÁLISIS =====\n")
  }

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
        console.log(`[v0] ML Shipments - Retry ${retries}/${maxRetries}, waiting ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      const ordersData = await getMercadoLibreOrders(accessToken, userId, filters)

      if (ordersData.results && ordersData.results.length > 0) {
        const sampleOrder = ordersData.results[0]
        console.log("[v0] Sample order shipping data:", JSON.stringify(sampleOrder.shipping, null, 2))
        console.log("[v0] Sample order full data:", JSON.stringify(sampleOrder, null, 2))
      }

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

      if (shipments.length > 0) {
        console.log("[v0] Sample processed shipment:", JSON.stringify(shipments[0], null, 2))
      }

      return {
        results: shipments,
        paging: ordersData.paging,
      }
    } catch (error: any) {
      lastError = error
      const errorMessage = error.message || String(error)

      if (errorMessage.includes("Too Many") || errorMessage.includes("429")) {
        console.log(`[v0] ML Shipments - Rate limit hit, attempt ${retries + 1}/${maxRetries + 1}`)
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
    console.error("[v0] Failed to create campaign:", errorText)
    throw new Error(`Failed to create campaign: ${errorText}`)
  }

  return response.json()
}
