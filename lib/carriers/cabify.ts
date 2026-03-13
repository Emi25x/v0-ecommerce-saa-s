/**
 * Cabify Logistics Argentina — API REST client
 *
 * Documentación oficial: https://developers.cabify.com/docs/introduction
 *
 * Autenticación: OAuth 2.0 client_credentials
 *   1. POST https://cabify.com/auth/api/authorization
 *      body: grant_type=client_credentials&client_id=OAUTH_ID&client_secret=SECRET
 *   2. Usar access_token como Bearer en todos los requests subsiguientes
 *
 * Base URL Logistics API: https://logistics.api.cabify.com
 *
 * Para activar la integración:
 *   1. En Cabify Logistics → Configuración → API → Generar claves de producción
 *   2. Guardar en tabla `carriers`:
 *        credentials.client_id     = OAUTH_ID que muestra Cabify
 *        credentials.client_secret = Secreto que muestra Cabify
 *   3. Cambiar active = true
 *
 * Cobertura actual: Buenos Aires (CABA y GBA), Córdoba
 */

export interface CabifyCredentials {
  client_id:     string   // OAUTH_ID de Cabify Logistics → Configuración → API
  client_secret: string   // Secreto generado junto al client_id
}

export interface CabifyConfig {
  base_url:   string   // https://logistics.api.cabify.com
  auth_url:   string   // https://cabify.com/auth/api/authorization
  timeout_ms: number
}

// ── Tipos de servicio ──────────────────────────────────────────────────────────
export type CabifyService =
  | "express"       // Entrega inmediata (horas)
  | "same_day"      // Mismo día
  | "next_day"      // Día siguiente
  | "scheduled"     // Entrega programada

// ── Dirección ─────────────────────────────────────────────────────────────────
export interface CabifyAddress {
  name:        string
  phone:       string
  email?:      string
  street:      string
  city:        string
  state:       string
  postal_code: string
  country:     string   // "AR"
  instructions?: string
}

// ── Item del paquete ───────────────────────────────────────────────────────────
export interface CabifyPackageItem {
  description:    string
  quantity:       number
  unit_price_ars: number
  weight_g?:      number
}

// ── Solicitud de creación de envío ────────────────────────────────────────────
export interface CabifyShipmentRequest {
  reference?:       string
  service:          CabifyService
  pickup:           CabifyAddress
  delivery:         CabifyAddress
  items:            CabifyPackageItem[]
  weight_g:         number
  declared_value:   number
  dimensions?: {
    length_cm: number
    width_cm:  number
    height_cm: number
  }
  notes?: string
}

// ── Respuesta de creación ──────────────────────────────────────────────────────
export interface CabifyShipmentResponse {
  id:               string
  tracking_code:    string
  status:           string
  label_url?:       string
  tracking_url?:    string
  estimated_cost?:  number
  estimated_pickup?: string
  estimated_delivery?: string
  error?:           string
}

// ── Evento de seguimiento ──────────────────────────────────────────────────────
export interface CabifyTrackingEvent {
  status:      string
  description: string
  location?:   string
  timestamp:   string
}

export interface CabifyTrackingResponse {
  package_id:    string
  tracking_code: string
  status:        string
  events:        CabifyTrackingEvent[]
  error?:        string
}

// ── Cotización ─────────────────────────────────────────────────────────────────
export interface CabifyQuoteRequest {
  pickup_postal_code:   string
  delivery_postal_code: string
  weight_g:             number
  declared_value:       number
  dimensions?: {
    length_cm: number
    width_cm:  number
    height_cm: number
  }
}

export interface CabifyQuoteResponse {
  services: Array<{
    service:         CabifyService
    name:            string
    price_ars:       number
    estimated_days:  number
    description:     string
  }>
  error?: string
}

// ── Token cache en memoria ─────────────────────────────────────────────────────
interface TokenEntry {
  access_token:  string
  refresh_token: string
  expires_at:    number   // epoch ms
}
const tokenCache = new Map<string, TokenEntry>()

// ── Cliente ────────────────────────────────────────────────────────────────────
export class CabifyLogisticsClient {
  private readonly baseUrl:      string
  private readonly authUrl:      string
  private readonly clientId:     string
  private readonly clientSecret: string
  private readonly timeout:      number

  private static readonly BASE_PATHS = {
    packages: "/v1/packages",
    quotes:   "/v1/quotes",
  }

  constructor(config: CabifyConfig, credentials: CabifyCredentials) {
    this.baseUrl      = (config.base_url  ?? "https://logistics.api.cabify.com").replace(/\/$/, "")
    this.authUrl      = (config.auth_url  ?? "https://cabify.com/auth/api/authorization").replace(/\/$/, "")
    this.clientId     = credentials.client_id
    this.clientSecret = credentials.client_secret
    this.timeout      = config.timeout_ms ?? 15000
  }

  // ── OAuth 2.0 ────────────────────────────────────────────────────────────────

  private cacheKey(): string {
    return `${this.authUrl}::${this.clientId}`
  }

  /** Obtiene un Bearer token válido, usando caché si no expiró */
  private async getBearerToken(): Promise<string> {
    const key    = this.cacheKey()
    const cached = tokenCache.get(key)
    // Renovar si falta menos de 5 minutos para expirar
    if (cached && cached.expires_at > Date.now() + 5 * 60 * 1000) {
      return cached.access_token
    }

    const body = new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     this.clientId,
      client_secret: this.clientSecret,
    })

    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), this.timeout)
    try {
      const res = await fetch(this.authUrl, {
        method:  "POST",
        signal:  controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    body.toString(),
      })

      const data = await res.json().catch(() => ({})) as any

      if (!res.ok) {
        throw new Error(
          `Cabify OAuth error ${res.status}: ${data?.error_description ?? data?.error ?? res.statusText}`
        )
      }

      const entry: TokenEntry = {
        access_token:  data.access_token,
        refresh_token: data.refresh_token ?? "",
        expires_at:    Date.now() + (data.expires_in ?? 3600) * 1000,
      }
      tokenCache.set(key, entry)
      return entry.access_token
    } finally {
      clearTimeout(timer)
    }
  }

  // ── HTTP helper ───────────────────────────────────────────────────────────────

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    path:   string,
    body?:  unknown
  ): Promise<T> {
    const token      = await this.getBearerToken()
    const url        = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(url, {
        method,
        signal:  controller.signal,
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
          "Accept":        "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const msg = (data as any)?.message ?? (data as any)?.error ?? res.statusText
        throw new Error(`Cabify Logistics API error ${res.status}: ${msg}`)
      }

      return data as T
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Métodos públicos ──────────────────────────────────────────────────────────

  /** Crear un nuevo envío */
  async createShipment(req: CabifyShipmentRequest): Promise<CabifyShipmentResponse> {
    return this.request<CabifyShipmentResponse>("POST", CabifyLogisticsClient.BASE_PATHS.packages, req)
  }

  /** Obtener estado de un envío */
  async getShipment(packageId: string): Promise<CabifyShipmentResponse> {
    return this.request<CabifyShipmentResponse>(
      "GET",
      `${CabifyLogisticsClient.BASE_PATHS.packages}/${encodeURIComponent(packageId)}`
    )
  }

  /** Marcar paquete como listo para recoger */
  async markReady(packageId: string): Promise<{ ok: boolean; error?: string }> {
    return this.request<{ ok: boolean; error?: string }>(
      "PATCH",
      `${CabifyLogisticsClient.BASE_PATHS.packages}/${encodeURIComponent(packageId)}/ready`
    )
  }

  /** Tracking por ID de paquete Cabify */
  async getTracking(packageId: string): Promise<CabifyTrackingResponse> {
    return this.request<CabifyTrackingResponse>(
      "GET",
      `${CabifyLogisticsClient.BASE_PATHS.packages}/${encodeURIComponent(packageId)}/tracking`
    )
  }

  /** Cotizar un envío sin crearlo */
  async quote(req: CabifyQuoteRequest): Promise<CabifyQuoteResponse> {
    return this.request<CabifyQuoteResponse>("POST", CabifyLogisticsClient.BASE_PATHS.quotes, req)
  }

  /**
   * Verifica conectividad y credenciales.
   * Paso 1: obtener token OAuth (valida client_id y client_secret).
   * Paso 2: hacer GET /v1/packages para confirmar acceso a la API de logística.
   */
  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.getBearerToken()
    } catch (err: any) {
      return { ok: false, message: err.message }
    }

    const url        = `${this.baseUrl}${CabifyLogisticsClient.BASE_PATHS.packages}`
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), this.timeout)
    try {
      const token = await this.getBearerToken()
      const res   = await fetch(url, {
        method:  "GET",
        signal:  controller.signal,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept":        "application/json",
        },
      })
      if (res.ok)                            return { ok: true,  message: "Conexión exitosa con Cabify Logistics API" }
      if (res.status === 401 || res.status === 403) return { ok: false, message: "Cabify Logistics: credenciales inválidas — verificá el Client ID y el Client Secret" }
      return { ok: false, message: `Cabify Logistics respondió con estado ${res.status}` }
    } catch (err: any) {
      if (err.name === "AbortError") return { ok: false, message: "Cabify Logistics: timeout — sin respuesta del servidor" }
      return { ok: false, message: `Cabify Logistics: no se pudo conectar — ${err.message}` }
    } finally {
      clearTimeout(timer)
    }
  }
}

/** Crear cliente desde la configuración guardada en DB */
export function createCabifyClient(
  config:      CabifyConfig,
  credentials: CabifyCredentials
): CabifyLogisticsClient {
  if (!credentials?.client_id || !credentials?.client_secret) {
    throw new Error("Cabify Logistics: client_id y client_secret son requeridos — generarlos en Cabify Logistics → Configuración → API")
  }
  return new CabifyLogisticsClient(config ?? {}, credentials)
}

/** Normalizar estado Cabify → estado interno */
export function mapCabifyStatus(status: string): string {
  const s = status?.toLowerCase() ?? ""
  if (s === "delivered")                           return "delivered"
  if (s === "in_transit" || s === "assigned")      return "in_transit"
  if (s === "failed"     || s === "cancelled")     return "failed"
  if (s === "returned")                            return "returned"
  return "pending"
}
