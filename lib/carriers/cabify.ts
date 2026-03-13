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

// ── Modalidades de envío ───────────────────────────────────────────────────────
export type CabifyModality = "express" | "same_day" | "next_day" | "groceries"

// ── Tipos de envío disponibles ────────────────────────────────────────────────
export interface CabifyShippingType {
  id:          string          // UUID
  name:        string
  modality:    CabifyModality
  description: string
}

// ── Hub (depósito/punto de pickup) ────────────────────────────────────────────
export interface CabifyHubRequest {
  external_id:   string
  address:       string
  location?:     { latitude: number; longitude: number }
  instructions?: string
  contact?:      { name?: string; phone?: string; email?: string }
}

// ── Parcel (paquete) ───────────────────────────────────────────────────────────
export interface CabifyParcelLocation {
  loc?:             [number, number]  // [lat, lon]
  addr?:            string            // dirección en texto
  hub_external_id?: string            // ID externo del hub
  name?:            string
  phone?:           string
  email?:           string
  instructions?:    string
}

export interface CabifyParcelInput {
  external_id?:  string               // tu propio ID de referencia
  pickup_info:   CabifyParcelLocation
  dropoff_info:  CabifyParcelLocation
  dimensions?: {
    length_cm: number
    width_cm:  number
    height_cm: number
  }
  weight?: {
    value: number
    unit:  "g" | "kg"
  }
}

export interface CabifyParcel {
  id:           string
  external_id?: string
  pickup_info:  CabifyParcelLocation
  dropoff_info: CabifyParcelLocation
  dimensions?:  Record<string, unknown>
  weight?:      Record<string, unknown>
  price?:       Record<string, unknown>
  created_at:   string
  updated_at:   string
}

export interface CabifyCreateParcelsResponse {
  parcels: CabifyParcel[]
  error?:  string
}

// ── Solicitud de envío (ship parcels) ─────────────────────────────────────────
export interface CabifyShipRequest {
  parcel_ids:       string[]    // UUIDs de los parcels ya creados
  shipping_type_id: string      // UUID del shipping type elegido
  pickup_time?:     string      // ISO 8601 — solo para modalidad express
}

export interface CabifyShipResponse {
  parcels: Array<{
    id:               string
    tracking_url?:    string
    shipping_type_id: string
  }>
  error?: string
}

// ── Estimación de envío ────────────────────────────────────────────────────────
export interface CabifyEstimateRequest {
  parcels: Array<{
    shipping_type_id: string    // UUID del shipping type a estimar
    pickup_time?:     string    // ISO 8601 — solo para express
  }>
}

export interface CabifyEstimateResponse {
  deliveries?: {
    parcels?:    Record<string, unknown>
    estimation?: Record<string, unknown>
  }
  error?: string
}

// ── Tracking ───────────────────────────────────────────────────────────────────
export interface CabifyTrackingEvent {
  status:      string
  description: string
  location?:   string
  timestamp:   string
}

export interface CabifyTrackingResponse {
  parcel_id:     string
  tracking_code: string
  status:        string
  events:        CabifyTrackingEvent[]
  error?:        string
}

// ── Compatibilidad hacia atrás (usado en create-shipment y quote routes) ───────
export interface CabifyShipmentRequest {
  parcel_ids:       string[]
  shipping_type_id: string
  pickup_time?:     string
}
export interface CabifyShipmentResponse {
  id?:             string
  tracking_code?:  string
  tracking_url?:   string
  label_url?:      string
  estimated_cost?: number
  status?:         string
  error?:          string
}
export interface CabifyQuoteRequest {
  pickup_postal_code:   string
  delivery_postal_code: string
  weight_g:             number
  declared_value?:      number
}
export interface CabifyQuoteResponse {
  services: CabifyShippingType[]
  error?:   string
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
    parcels:       "/v1/parcels",
    ship:          "/v1/parcels/ship",
    estimate:      "/v3/parcels/estimate",
    shippingTypes: "/v1/shipping_types/available",
    hubs:          "/v1/hubs",
    webhooks:      "/v1/webhooks",
    users:         "/v1/users",
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
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
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

  // ── Parcels ───────────────────────────────────────────────────────────────────

  /**
   * Crear uno o varios parcels.
   * POST /v1/parcels
   * Los parcels quedan pendientes hasta llamar a shipParcels().
   * pickup_info y dropoff_info requieren al menos uno de: loc, addr, hub_external_id.
   */
  async createParcels(parcels: CabifyParcelInput[]): Promise<CabifyCreateParcelsResponse> {
    return this.request<CabifyCreateParcelsResponse>("POST", CabifyLogisticsClient.BASE_PATHS.parcels, { parcels })
  }

  /**
   * Tipos de envío disponibles para una ubicación.
   * GET /v1/shipping_types/available?location=lat,lon
   * Usado también como healthcheck.
   */
  async getShippingTypes(lat = -34.603722, lon = -58.381592): Promise<CabifyShippingType[]> {
    const token      = await this.getBearerToken()
    const url        = `${this.baseUrl}${CabifyLogisticsClient.BASE_PATHS.shippingTypes}?location=${lat},${lon}`
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), this.timeout)
    try {
      const res = await fetch(url, {
        method:  "GET",
        signal:  controller.signal,
        headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
      })
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        const msg = (data as any)?.message ?? (data as any)?.error ?? res.statusText
        throw new Error(`Cabify Logistics API error ${res.status}: ${msg}`)
      }
      return Array.isArray(data) ? data : []
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Enviar parcels ya creados.
   * POST /v1/parcels/ship
   */
  async shipParcels(req: CabifyShipRequest): Promise<CabifyShipResponse> {
    return this.request<CabifyShipResponse>("POST", CabifyLogisticsClient.BASE_PATHS.ship, req)
  }

  /**
   * Estimar precio y tiempo de envío para parcels ya creados.
   * POST /v3/parcels/estimate
   * Nota: usa /v3/, no /v1/
   */
  async estimate(req: CabifyEstimateRequest): Promise<CabifyEstimateResponse> {
    const token      = await this.getBearerToken()
    const url        = `${this.baseUrl}${CabifyLogisticsClient.BASE_PATHS.estimate}`
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), this.timeout)
    try {
      const res = await fetch(url, {
        method:  "POST",
        signal:  controller.signal,
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
          "Accept":        "application/json",
        },
        body: JSON.stringify(req),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = (data as any)?.message ?? (data as any)?.error ?? res.statusText
        throw new Error(`Cabify Logistics API error ${res.status}: ${msg}`)
      }
      return data as CabifyEstimateResponse
    } finally {
      clearTimeout(timer)
    }
  }

  /** Obtener estado y tracking de un parcel */
  async getTracking(parcelId: string): Promise<CabifyTrackingResponse> {
    return this.request<CabifyTrackingResponse>(
      "GET",
      `${CabifyLogisticsClient.BASE_PATHS.parcels}/${encodeURIComponent(parcelId)}/tracking`
    )
  }

  // ── Hubs ──────────────────────────────────────────────────────────────────────

  /** Listar hubs del cliente */
  async listHubs(): Promise<{ client_hubs: any[] }> {
    return this.request("GET", CabifyLogisticsClient.BASE_PATHS.hubs)
  }

  /** Crear un hub (punto de pickup/depósito) */
  async createHub(req: CabifyHubRequest): Promise<any> {
    return this.request("POST", CabifyLogisticsClient.BASE_PATHS.hubs, req)
  }

  /** Obtener hub por external_id */
  async getHub(externalId: string): Promise<any> {
    return this.request("GET", `/v1/hubs/none/${encodeURIComponent(externalId)}`)
  }

  /** Actualizar hub por external_id */
  async updateHub(externalId: string, data: Partial<CabifyHubRequest>): Promise<any> {
    return this.request("PUT" as any, `/v1/hubs/none/${encodeURIComponent(externalId)}`, data)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────────

  /** Suscribirse a actualizaciones de parcels */
  async subscribeWebhook(hook: "parcel" | "parcelLocation" | "proofCodeGenerated", callbackUrl: string, headers?: Array<{ name: string; value: string }>): Promise<any> {
    return this.request("POST", CabifyLogisticsClient.BASE_PATHS.webhooks, { hook, callback_url: callbackUrl, headers })
  }

  /** Ver suscripciones activas */
  async listWebhooks(): Promise<{ subscriptions: any[] }> {
    return this.request("GET", CabifyLogisticsClient.BASE_PATHS.webhooks)
  }

  /** Eliminar suscripción de webhook */
  async deleteWebhook(hook: "parcel" | "parcelLocation" | "proofCodeGenerated"): Promise<void> {
    return this.request("DELETE", `${CabifyLogisticsClient.BASE_PATHS.webhooks}/${encodeURIComponent(hook)}`)
  }

  // ── Usuarios ──────────────────────────────────────────────────────────────────

  /** Listar usuarios del cliente */
  async listUsers(): Promise<Array<{ id: string; name: string; email: string; payment_method_available: boolean }>> {
    return this.request("GET", CabifyLogisticsClient.BASE_PATHS.users)
  }

  // ── Compatibilidad con routes existentes ──────────────────────────────────────

  /**
   * Alias para shipParcels() — usado por create-shipment/route.ts.
   * Recibe { parcel_ids, shipping_type_id, pickup_time? }
   */
  async createShipment(req: CabifyShipmentRequest): Promise<CabifyShipmentResponse> {
    const res = await this.shipParcels(req)
    const first = res.parcels?.[0]
    return {
      id:            first?.id,
      tracking_code: first?.id,
      tracking_url:  first?.tracking_url,
      status:        "pending",
      error:         res.error,
    }
  }

  /**
   * Alias para getShippingTypes() — usado por quote/route.ts.
   * Devuelve los shipping types disponibles como "servicios".
   */
  async quote(_req: CabifyQuoteRequest): Promise<CabifyQuoteResponse> {
    const types = await this.getShippingTypes()
    return { services: types }
  }

  /**
   * Verifica conectividad y credenciales.
   * 1. Obtiene token OAuth (valida client_id/client_secret).
   * 2. GET /v1/shipping_types/available para confirmar acceso a la API.
   */
  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.getBearerToken()
    } catch (err: any) {
      return { ok: false, message: err.message }
    }
    try {
      const types = await this.getShippingTypes()
      return {
        ok:      true,
        message: `Conexión exitosa con Cabify Logistics API — ${types.length} tipo(s) de envío disponibles`,
      }
    } catch (err: any) {
      if (err.name === "AbortError") return { ok: false, message: "Cabify Logistics: timeout — sin respuesta del servidor" }
      return { ok: false, message: err.message }
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
