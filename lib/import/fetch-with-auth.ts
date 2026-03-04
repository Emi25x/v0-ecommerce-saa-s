/**
 * Helper para construir fetch con autenticación según el tipo de auth de la fuente
 */

interface SourceAuth {
  url_template: string
  auth_type?: string
  credentials?: {
    params?: Record<string, string>
    username?: string
    password?: string
    token?: string
  }
}

/**
 * Construye la URL completa con query params si auth_type es query_params
 */
export function buildAuthenticatedUrl(source: SourceAuth): string {
  const baseUrl = source.url_template

  if (source.auth_type === "query_params" && source.credentials?.params) {
    const url = new URL(baseUrl)
    
    // Agregar cada parámetro a la URL
    Object.entries(source.credentials.params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
    
    return url.toString()
  }

  // Sin query params o auth type diferente
  return baseUrl
}

/**
 * Construye headers de autenticación según el tipo
 */
export function buildAuthHeaders(source: SourceAuth): HeadersInit {
  const headers: HeadersInit = {}

  if (source.auth_type === "basic_auth" && source.credentials?.username && source.credentials?.password) {
    const credentials = `${source.credentials.username}:${source.credentials.password}`
    const encoded = Buffer.from(credentials).toString("base64")
    headers["Authorization"] = `Basic ${encoded}`
  } else if (source.auth_type === "bearer_token" && source.credentials?.token) {
    headers["Authorization"] = `Bearer ${source.credentials.token}`
  }

  return headers
}

/**
 * Ejecuta fetch con la autenticación correcta aplicada
 */
export async function fetchWithAuth(source: SourceAuth): Promise<Response> {
  const url = buildAuthenticatedUrl(source)
  const headers = buildAuthHeaders(source)

  console.log(`[v0][FETCH-AUTH] Base URL: ${source.url_template}`)
  console.log(`[v0][FETCH-AUTH] Auth type: ${source.auth_type || "none"}`)
  console.log(`[v0][FETCH-AUTH] Credentials:`, JSON.stringify(source.credentials))
  console.log(`[v0][FETCH-AUTH] Final URL: ${url}`)
  console.log(`[v0][FETCH-AUTH] Headers:`, JSON.stringify(headers))

  const response = await fetch(url, { headers })
  
  console.log(`[v0][FETCH-AUTH] Response status: ${response.status} ${response.statusText}`)
  console.log(`[v0][FETCH-AUTH] Response headers:`, JSON.stringify(Object.fromEntries(response.headers.entries())))
  
  return response
}
