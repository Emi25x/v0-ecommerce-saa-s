// Libral ERP API client and utilities

const LIBRAL_API_BASE = "https://libral.core.abazal.com/api"
const LIBRAL_DATABASE = "GN6LIBRAL"

const LIBRAL_MAX_TAKE = 1000 // Máximo de productos por petición (protección contra 2M de productos)
const LIBRAL_DEFAULT_TAKE = 50 // Tamaño de página por defecto
const LIBRAL_BATCH_DELAY_MS = 1000 // Pausa entre lotes para no sobrecargar el servidor

export interface LibralAuthTokens {
  token: string
  expires_at: string // 1 month validity
}

export interface LibralProduct {
  id: string
  ean: string
  titulo: string
  subtitulo?: string
  activo: boolean
  precioventa: number
  stockfirmetotal: number
  stockdisponibletotal: number
  urlfotografia?: string
  resumen?: string
  sinopsis?: string
  nombreproveedor?: string
  nombreeditorial?: string
  nombretipoarticulo?: string
  peso?: number
  ancho?: number
  alto?: number
  grosor?: number
}

export interface LibralQueryParams {
  take?: number
  skip?: number
  select?: string[]
  filter?: string[]
  sort?: Array<{ selector: string; desc?: boolean }>
  requireTotalCount?: boolean
}

export interface LibralQueryResponse<T> {
  data: T[]
  totalCount: number
  groupCount: number
  summary: any
}

export interface LibralOrder {
  id?: string
  fecha: string
  items: LibralOrderItem[]
  cliente?: {
    nombre: string
    email?: string
    telefono?: string
  }
  total: number
  estado: "pendiente" | "procesando" | "enviado" | "entregado"
}

export interface LibralOrderItem {
  ean: string
  cantidad: number
  precio: number
}

/**
 * Fetch with retry logic and timeout
 */
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, timeout = 30000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      return response
    } catch (error) {
      const isLastRetry = i === retries - 1

      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[v0] Request timeout (attempt ${i + 1}/${retries})`)
        if (isLastRetry) throw new Error(`Request timeout after ${retries} attempts`)
      } else {
        console.error(`[v0] Network error (attempt ${i + 1}/${retries}):`, error)
        if (isLastRetry) throw error
      }

      // Exponential backoff: wait 1s, 2s, 4s
      if (!isLastRetry) {
        const waitTime = Math.pow(2, i) * 1000
        console.log(`[v0] Retrying in ${waitTime}ms...`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
    }
  }

  throw new Error("Failed to fetch after retries")
}

/**
 * Authenticate with Libral and get JWT token
 */
export async function authenticateLibral(username: string, password: string): Promise<LibralAuthTokens> {
  const cleanUsername = username.trim().replace(/^["']|["']$/g, "")
  const cleanPassword = password.trim().replace(/^["']|["']$/g, "")

  const url = `${LIBRAL_API_BASE}/auth/login?db=${LIBRAL_DATABASE}`

  console.log("[v0] Libral Auth - URL:", url)
  console.log("[v0] Libral Auth - Username (cleaned):", cleanUsername)
  console.log("[v0] Libral Auth - Password length:", cleanPassword.length)

  const requestBody = {
    username: cleanUsername,
    password: cleanPassword,
  }

  console.log("[v0] Libral Auth - Request body:", JSON.stringify(requestBody))

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
  })

  console.log("[v0] Libral Auth - Response status:", response.status)

  if (!response.ok) {
    const errorText = await response.text()
    console.error("[v0] Libral Auth - Error response:", errorText)
    throw new Error(`Failed to authenticate with Libral: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log("[v0] Libral Auth - Token received successfully")

  // Token válido por 1 mes
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 1)

  return {
    token: data.token,
    expires_at: expiresAt.toISOString(),
  }
}

/**
 * Query Libral products with advanced filtering
 *
 * IMPORTANTE: Libral tiene 2+ millones de productos. SIEMPRE usar paginación.
 * - Máximo permitido: 1000 productos por petición
 * - Por defecto: 50 productos por petición
 * - NUNCA hacer peticiones sin límite (take)
 */
export async function queryLibralProducts(
  token: string,
  params?: LibralQueryParams,
): Promise<LibralQueryResponse<LibralProduct>> {
  const take = params?.take ?? LIBRAL_DEFAULT_TAKE

  if (take > LIBRAL_MAX_TAKE) {
    console.warn(`[v0] Libral Products - Take ${take} excede el máximo permitido (${LIBRAL_MAX_TAKE}). Ajustando...`)
    throw new Error(`Cannot request more than ${LIBRAL_MAX_TAKE} products at once. Use pagination for larger datasets.`)
  }

  if (take <= 0) {
    throw new Error("Take must be greater than 0")
  }

  const url = `${LIBRAL_API_BASE}/libroes/LibrosLIBRAL?db=${LIBRAL_DATABASE}`

  const requestBody: any = {
    take,
  }

  // Solo agregar skip si es mayor a 0
  if (params?.skip && params.skip > 0) {
    requestBody.skip = params.skip
  }

  // Convertir select array a string formato DevExtreme: "['campo1','campo2']"
  if (params?.select && params.select.length > 0) {
    requestBody.select = `[${params.select.map((field) => `'${field}'`).join(",")}]`
  }

  // Convertir filter array a string formato DevExtreme: "['campo','=','valor']"
  if (params?.filter && params.filter.length > 0) {
    requestBody.filter = `[${params.filter.map((item) => (typeof item === "string" ? `'${item}'` : item)).join(",")}]`
  }

  if (params?.sort && params.sort.length > 0) {
    requestBody.sort = params.sort
  }

  // Solo agregar requireTotalCount si se solicita explícitamente
  if (params?.requireTotalCount === true) {
    requestBody.requireTotalCount = true
  }

  console.log("[v0] Libral Products - Query URL:", url)
  console.log("[v0] Libral Products - Request body:", JSON.stringify(requestBody))

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (response.status === 401) {
    console.log("[v0] Libral Products - Token expired (401), refreshing token")
    const newToken = await getLibralToken()

    const retryResponse = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${newToken}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!retryResponse.ok) {
      const errorText = await retryResponse.text()
      console.error("[v0] Libral Products - Error after token refresh:", errorText)
      throw new Error(`Failed to query Libral products: ${retryResponse.status} - ${errorText}`)
    }

    const data = await retryResponse.json()
    console.log("[v0] Libral Products - Retrieved:", data.data?.length || 0, "products (after token refresh)")
    return data
  }

  if (!response.ok) {
    const errorText = await response.text()
    console.error("[v0] Libral Products - Error response:", errorText)
    throw new Error(`Failed to query Libral products: ${response.status} - ${errorText}`)
  }

  const contentType = response.headers.get("content-type")
  if (!contentType || !contentType.includes("application/json")) {
    const textResponse = await response.text()
    console.error("[v0] Libral Products - Non-JSON response:", textResponse)
    throw new Error(`API returned non-JSON response: ${textResponse.substring(0, 100)}`)
  }

  const data = await response.json()
  console.log("[v0] Libral Products - Retrieved:", data.data?.length || 0, "products")
  console.log("[v0] Libral Products - Total count:", data.totalCount)

  return data
}

/**
 * Get all active products from Libral with pagination
 *
 * IMPORTANTE: Usa paginación segura. Máximo 1000 productos por página.
 */
export async function getLibralProducts(
  page = 0,
  pageSize = LIBRAL_DEFAULT_TAKE,
): Promise<LibralQueryResponse<LibralProduct>> {
  if (pageSize > LIBRAL_MAX_TAKE) {
    console.warn(`[v0] Libral Products - PageSize ${pageSize} excede el máximo (${LIBRAL_MAX_TAKE}). Ajustando...`)
    pageSize = LIBRAL_MAX_TAKE
  }

  if (pageSize <= 0) {
    pageSize = LIBRAL_DEFAULT_TAKE
  }

  const token = await getLibralToken()
  return queryLibralProducts(token, {
    take: pageSize,
    skip: page * pageSize,
    select: [
      "id",
      "ean",
      "titulo",
      "subtitulo",
      "activo",
      "precioventa",
      "stockfirmetotal",
      "stockdisponibletotal",
      "urlfotografia",
      "resumen",
      "sinopsis",
      "nombreproveedor",
      "nombreeditorial",
      "nombretipoarticulo",
      "peso",
      "ancho",
      "alto",
      "grosor",
    ],
    filter: ["activo", "=", true],
    sort: [{ selector: "fechaultimactualizacion", desc: true }],
    requireTotalCount: true,
  })
}

/**
 * Get a single product by EAN
 */
export async function getLibralProductByEAN(ean: string): Promise<LibralProduct | null> {
  const token = await getLibralToken()
  const result = await queryLibralProducts(token, {
    take: 1,
    filter: ["ean", "=", ean],
  })

  return result.data[0] || null
}

/**
 * Update stock in Libral (placeholder - needs actual endpoint from documentation)
 */
export async function updateLibralStock(token: string, ean: string, quantity: number): Promise<void> {
  // TODO: Implement when endpoint is available in documentation
  console.log("[v0] Libral Stock Update - EAN:", ean, "Quantity:", quantity)
  console.log("[v0] Libral Stock Update - Waiting for API endpoint documentation")
  throw new Error("Stock update endpoint not yet implemented - waiting for API documentation")
}

/**
 * Send order to Libral as "documento de entrada" (placeholder - needs actual endpoint)
 */
export async function sendLibralOrder(token: string, order: LibralOrder): Promise<any> {
  // TODO: Implement when endpoint is available in documentation
  console.log("[v0] Libral Order - Sending order:", order)
  console.log("[v0] Libral Order - Waiting for API endpoint documentation")
  throw new Error("Order creation endpoint not yet implemented - waiting for API documentation")
}

/**
 * Get orders from Libral (placeholder - needs actual endpoint)
 */
export async function getLibralOrders(filters?: { estado?: string; fechaDesde?: string; fechaHasta?: string }): Promise<
  LibralOrder[]
> {
  // TODO: Implement when endpoint is available in documentation
  console.log("[v0] Libral Orders - Fetching orders with filters:", filters)
  console.log("[v0] Libral Orders - Waiting for API endpoint documentation")
  throw new Error("Orders endpoint not yet implemented - waiting for API documentation")
}

/**
 * Check if token is still valid
 */
export function isLibralTokenValid(expiresAt: string): boolean {
  const expiryDate = new Date(expiresAt)
  const now = new Date()
  return expiryDate > now
}

/**
 * Get Libral credentials from database
 */
export async function getLibralCredentials(): Promise<{ username: string; password: string } | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server")
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("integration_configs")
      .select("credentials")
      .eq("integration_name", "libral")
      .eq("is_active", true)
      .single()

    if (error || !data) {
      // Fallback to environment variables
      if (process.env.LIBRAL_USERNAME && process.env.LIBRAL_PASSWORD) {
        return {
          username: process.env.LIBRAL_USERNAME,
          password: process.env.LIBRAL_PASSWORD,
        }
      }
      // Credenciales por defecto según documentación
      return {
        username: "SHOPIFY",
        password: "A#7890.ATGHIp",
      }
    }

    return data.credentials as { username: string; password: string }
  } catch (error) {
    console.error("[v0] Error fetching Libral credentials:", error)
    // Fallback to environment variables
    if (process.env.LIBRAL_USERNAME && process.env.LIBRAL_PASSWORD) {
      return {
        username: process.env.LIBRAL_USERNAME,
        password: process.env.LIBRAL_PASSWORD,
      }
    }
    // Credenciales por defecto según documentación
    return {
      username: "SHOPIFY",
      password: "A#7890.ATGHIp",
    }
  }
}

/**
 * Check if Libral is configured
 */
export async function isLibralConfigured(): Promise<boolean> {
  const credentials = await getLibralCredentials()
  return credentials !== null
}

/**
 * Get valid token for Libral (reuses existing token or authenticates if expired)
 */
export async function getLibralToken(): Promise<string> {
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()

  const { data: config, error } = await supabase
    .from("integration_configs")
    .select("credentials, token, token_expires_at")
    .eq("integration_name", "libral")
    .eq("is_active", true)
    .single()

  if (error || !config) {
    throw new Error("Libral integration not configured")
  }

  if (config.token && config.token_expires_at) {
    const isValid = isLibralTokenValid(config.token_expires_at)
    if (isValid) {
      console.log("[v0] Libral Token - Reusing existing valid token")
      return config.token
    }
    console.log("[v0] Libral Token - Token expired, re-authenticating")
  } else {
    console.log("[v0] Libral Token - No token found, authenticating")
  }

  const credentials = config.credentials as { username: string; password: string }
  const authResult = await authenticateLibral(credentials.username, credentials.password)

  const { error: updateError } = await supabase
    .from("integration_configs")
    .update({
      token: authResult.token,
      token_expires_at: authResult.expires_at,
      last_tested_at: new Date().toISOString(),
    })
    .eq("integration_name", "libral")

  if (updateError) {
    console.error("[v0] Libral Token - Error saving token:", updateError)
  } else {
    console.log("[v0] Libral Token - New token saved successfully")
  }

  return authResult.token
}

/**
 * Utility function to add delay between batch operations
 */
export async function delayBetweenBatches(ms: number = LIBRAL_BATCH_DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
