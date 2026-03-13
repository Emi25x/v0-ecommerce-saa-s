/**
 * FastMail Argentina — API v2 client
 *
 * Documentación: https://epresislv.fastmail.com.ar/docs/index.html#apis-v2
 * (Requiere credenciales de cliente para acceder)
 *
 * Para activar la integración:
 *   1. Configurar user/password en la tabla carriers donde slug = 'fastmail'
 *   2. Cambiar active = true
 *
 * Endpoints implementados (basados en estructura típica de API v2 de FastMail):
 *   POST /api/v2/envios         — crear envío y obtener etiqueta
 *   GET  /api/v2/envios/{id}    — consultar estado
 *   GET  /api/v2/tracking/{nro} — tracking por número de guía
 *   POST /api/v2/cotizar        — cotizar envío
 */

export interface FastMailCredentials {
  token?:   string   // API token (Bearer) — método preferido
  user?:    string   // Usuario (fallback Basic Auth)
  password?: string  // Contraseña (fallback Basic Auth)
}

export interface FastMailConfig {
  base_url:    string
  api_version: string
  timeout_ms:  number
}

export interface FastMailAddress {
  nombre:    string
  direccion: string
  localidad: string
  provincia: string
  cp:        string
  telefono?: string
  email?:    string
}

export interface FastMailItem {
  descripcion: string
  cantidad:    number
  peso_g:      number
  valor:       number
}

export interface FastMailShipmentRequest {
  remitente:    FastMailAddress
  destinatario: FastMailAddress
  items:        FastMailItem[]
  peso_total_g: number
  valor_declarado: number
  servicio?:    "standard" | "express" | "economico"
  referencia?:  string  // nuestro ID interno
}

export interface FastMailShipmentResponse {
  id:              string
  numero_guia:     string
  estado:          string
  url_etiqueta?:   string
  url_seguimiento?: string
  costo?:          number
  error?:          string
}

export interface FastMailTrackingEvent {
  estado:      string
  descripcion: string
  ubicacion?:  string
  fecha:       string
}

export interface FastMailTrackingResponse {
  numero_guia: string
  estado:      string
  eventos:     FastMailTrackingEvent[]
  error?:      string
}

export interface FastMailQuoteRequest {
  origen_cp:   string
  destino_cp:  string
  peso_g:      number
  valor:       number
  dimensiones?: { largo_cm: number; ancho_cm: number; alto_cm: number }
}

export interface FastMailQuoteResponse {
  servicios: Array<{
    codigo:      string
    nombre:      string
    plazo_dias:  number
    precio:      number
  }>
  error?: string
}

export class FastMailClient {
  private readonly baseUrl:  string
  private readonly token:    string | undefined
  private readonly user:     string
  private readonly password: string
  private readonly timeout:  number

  constructor(config: FastMailConfig, credentials: FastMailCredentials) {
    this.baseUrl  = config.base_url.replace(/\/$/, "")
    this.token    = credentials.token
    this.user     = credentials.user     ?? ""
    this.password = credentials.password ?? ""
    this.timeout  = config.timeout_ms ?? 15000
  }

  private authHeader(): string {
    if (this.token) return `Bearer ${this.token}`
    const encoded = Buffer.from(`${this.user}:${this.password}`).toString("base64")
    return `Basic ${encoded}`
  }

  private async request<T>(
    method: "GET" | "POST",
    path:   string,
    body?:  unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type":  "application/json",
          "Authorization": this.authHeader(),
          "Accept":        "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          `FastMail API error ${res.status}: ${(data as any)?.message ?? res.statusText}`
        )
      }

      return data as T
    } finally {
      clearTimeout(timer)
    }
  }

  /** Crear un nuevo envío y obtener la etiqueta */
  async createShipment(req: FastMailShipmentRequest): Promise<FastMailShipmentResponse> {
    return this.request<FastMailShipmentResponse>("POST", "/api/v2/envios", req)
  }

  /** Obtener estado de un envío por su ID de FastMail */
  async getShipment(id: string): Promise<FastMailShipmentResponse> {
    return this.request<FastMailShipmentResponse>("GET", `/api/v2/envios/${encodeURIComponent(id)}`)
  }

  /** Tracking por número de guía */
  async getTracking(trackingNumber: string): Promise<FastMailTrackingResponse> {
    return this.request<FastMailTrackingResponse>(
      "GET",
      `/api/v2/tracking/${encodeURIComponent(trackingNumber)}`
    )
  }

  /** Cotizar envío */
  async quote(req: FastMailQuoteRequest): Promise<FastMailQuoteResponse> {
    return this.request<FastMailQuoteResponse>("POST", "/api/v2/cotizar", req)
  }
}

/** Crear cliente desde la configuración guardada en DB */
export function createFastMailClient(
  config: FastMailConfig,
  credentials: FastMailCredentials
): FastMailClient {
  if (!credentials.token && (!credentials.user || !credentials.password)) {
    throw new Error("FastMail: configurá el token API o el usuario/contraseña en Transportistas → Fast Mail")
  }
  return new FastMailClient(config, credentials)
}
