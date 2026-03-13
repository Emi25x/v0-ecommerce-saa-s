/**
 * Cabify Logistics Argentina — API REST client
 *
 * Documentación oficial: https://developers.cabify.com/reference/logistics-introduction
 * (Requiere cuenta activa en Cabify Logistics para acceder al portal de desarrolladores)
 *
 * Para activar la integración:
 *   1. Obtener el API Key en el panel de Cabify Logistics → Configuración → API
 *   2. Guardar en tabla `carriers` con slug = 'cabify', credentials.api_key = <tu_key>
 *   3. Cambiar active = true
 *
 * Cobertura actual: Buenos Aires (CABA y GBA), Córdoba
 *
 * Endpoints implementados:
 *   POST   /logistics/v1/packages           — crear envío
 *   GET    /logistics/v1/packages/{id}      — obtener estado
 *   PATCH  /logistics/v1/packages/{id}/ready — marcar listo para recoger
 *   GET    /logistics/v1/packages/{id}/tracking — eventos de seguimiento
 *   POST   /logistics/v1/quotes             — cotizar envío
 *
 * NOTA: Si algún endpoint difiere de la versión actual de la API, ajustar
 * en BASE_PATHS abajo y confirmar con docs o soporte: apisupport@cabify.com
 */

export interface CabifyCredentials {
  api_key: string
}

export interface CabifyConfig {
  base_url:    string  // default: "https://api.cabify.com"
  timeout_ms:  number  // default: 15000
}

// ── Tipos de servicio ──────────────────────────────────────────────────────────
export type CabifyService =
  | "express"       // Entrega inmediata (horas)
  | "same_day"      // Mismo día
  | "next_day"      // Día siguiente
  | "scheduled"     // Entrega programada

// ── Dirección ─────────────────────────────────────────────────────────────────
export interface CabifyAddress {
  name:        string   // Nombre del contacto
  phone:       string   // Teléfono de contacto
  email?:      string
  street:      string   // Calle y número
  city:        string   // Ciudad
  state:       string   // Provincia (e.g. "Buenos Aires")
  postal_code: string   // Código postal
  country:     string   // "AR"
  instructions?: string // Instrucciones adicionales para el repartidor
}

// ── Item del paquete ───────────────────────────────────────────────────────────
export interface CabifyPackageItem {
  description:    string
  quantity:       number
  unit_price_ars: number  // Precio unitario en ARS
  weight_g?:      number
}

// ── Solicitud de creación de envío ────────────────────────────────────────────
export interface CabifyShipmentRequest {
  reference?:       string          // ID interno propio (número de pedido, etc.)
  service:          CabifyService
  pickup:           CabifyAddress
  delivery:         CabifyAddress
  items:            CabifyPackageItem[]
  weight_g:         number          // Peso total del paquete en gramos
  declared_value:   number          // Valor declarado en ARS
  dimensions?: {
    length_cm: number
    width_cm:  number
    height_cm: number
  }
  notes?: string                    // Nota interna del envío
}

// ── Respuesta de creación ──────────────────────────────────────────────────────
export interface CabifyShipmentResponse {
  id:               string
  tracking_code:    string          // Código de seguimiento público
  status:           string          // "pending" | "assigned" | "in_transit" | "delivered" | "failed"
  label_url?:       string          // URL de la etiqueta PDF
  tracking_url?:    string          // URL de seguimiento para el cliente
  estimated_cost?:  number          // Costo estimado en ARS
  estimated_pickup?: string         // ISO datetime estimado de recolección
  estimated_delivery?: string       // ISO datetime estimado de entrega
  error?:           string
}

// ── Evento de seguimiento ──────────────────────────────────────────────────────
export interface CabifyTrackingEvent {
  status:      string
  description: string
  location?:   string
  timestamp:   string   // ISO datetime
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

// ── Cliente ────────────────────────────────────────────────────────────────────
export class CabifyLogisticsClient {
  private readonly baseUrl: string
  private readonly apiKey:  string
  private readonly timeout: number

  // Paths de la API — ajustar si Cabify actualiza versiones
  private static readonly BASE_PATHS = {
    packages:  "/logistics/v1/packages",
    quotes:    "/logistics/v1/quotes",
  }

  constructor(config: CabifyConfig, credentials: CabifyCredentials) {
    this.baseUrl = (config.base_url ?? "https://api.cabify.com").replace(/\/$/, "")
    this.apiKey  = credentials.api_key
    this.timeout = config.timeout_ms ?? 15000
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    path:   string,
    body?:  unknown
  ): Promise<T> {
    const url        = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(url, {
        method,
        signal:  controller.signal,
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
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

  /**
   * Crear un nuevo envío.
   * El paquete quedará en estado "pending" hasta llamar a markReady().
   */
  async createShipment(req: CabifyShipmentRequest): Promise<CabifyShipmentResponse> {
    return this.request<CabifyShipmentResponse>(
      "POST",
      CabifyLogisticsClient.BASE_PATHS.packages,
      req
    )
  }

  /** Obtener estado y datos de un envío por su ID de Cabify */
  async getShipment(packageId: string): Promise<CabifyShipmentResponse> {
    return this.request<CabifyShipmentResponse>(
      "GET",
      `${CabifyLogisticsClient.BASE_PATHS.packages}/${encodeURIComponent(packageId)}`
    )
  }

  /**
   * Marcar el paquete como listo para recoger.
   * Cabify asignará un repartidor una vez recibida esta señal.
   */
  async markReady(packageId: string): Promise<{ ok: boolean; error?: string }> {
    return this.request<{ ok: boolean; error?: string }>(
      "PATCH",
      `${CabifyLogisticsClient.BASE_PATHS.packages}/${encodeURIComponent(packageId)}/ready`
    )
  }

  /** Obtener historial de eventos de seguimiento */
  async getTracking(packageId: string): Promise<CabifyTrackingResponse> {
    return this.request<CabifyTrackingResponse>(
      "GET",
      `${CabifyLogisticsClient.BASE_PATHS.packages}/${encodeURIComponent(packageId)}/tracking`
    )
  }

  /** Cotizar un envío sin crearlo */
  async quote(req: CabifyQuoteRequest): Promise<CabifyQuoteResponse> {
    return this.request<CabifyQuoteResponse>(
      "POST",
      CabifyLogisticsClient.BASE_PATHS.quotes,
      req
    )
  }
}

/** Crear cliente desde la configuración guardada en DB */
export function createCabifyClient(
  config:      CabifyConfig,
  credentials: CabifyCredentials
): CabifyLogisticsClient {
  if (!credentials?.api_key) {
    throw new Error("Cabify Logistics: api_key no configurada — obtenerla en el panel de Cabify Logistics")
  }
  return new CabifyLogisticsClient(config ?? {}, credentials)
}

/** Normalizar estado Cabify → estado interno */
export function mapCabifyStatus(status: string): string {
  const s = status?.toLowerCase() ?? ""
  if (s === "delivered")                           return "delivered"
  if (s === "in_transit" || s === "assigned")      return "in_transit"
  if (s === "failed" || s === "cancelled")         return "failed"
  if (s === "returned")                            return "returned"
  return "pending"
}
