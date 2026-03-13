/**
 * FastMail Argentina — API v2 client
 *
 * Autenticación: `api_token` en el body de cada request POST (no Authorization header)
 * Base URL: https://epresislv.fastmail.com.ar
 *
 * Endpoints implementados:
 *   POST /api/v2/dummy-test.json      — health check / verificar credenciales
 *   POST /api/v2/consultarStock       — consultar stock por SKU
 *   POST /api/v2/listarCps            — listar códigos postales disponibles
 *   POST /api/v2/generaRecepcion.json — generar remito de recepción (WMS)
 *   POST /api/v2/editarSucursal.json  — editar datos de sucursal
 */

export interface FastMailCredentials {
  token: string  // API token — requerido para todos los endpoints
  user?: string  // No usado en la API real, solo guardado por compatibilidad
  password?: string
}

export interface FastMailConfig {
  base_url:    string
  api_version?: string
  timeout_ms:  number
}

// ── Tipos de respuesta ───────────────────────────────────────────────────────

export interface FastMailHealthCheckResponse {
  server:   string   // "OK"
  user:     string   // "OK"
  cliente?: string   // Nombre del cliente, ej: "Presis Consultores"
  error?:   string
}

export interface FastMailStockItem {
  sku:        string
  descripcion?: string
  stock:      number
  [key: string]: unknown
}

export interface FastMailConsultarStockResponse {
  items?: FastMailStockItem[]
  error?: string
  [key: string]: unknown
}

export interface FastMailCp {
  cp:        string
  localidad?: string
  provincia?: string
  [key: string]: unknown
}

export interface FastMailListarCpsResponse {
  cps?:  FastMailCp[]
  error?: string
  [key: string]: unknown
}

export interface FastMailProductoRecepcion {
  sku:         string
  descripcion: string
  cajas:       number
  cantidad:    number
  trazable?:   boolean
}

export interface FastMailContacto {
  nombre:    string
  calle:     string
  cp:        string
  localidad: string
  provincia: string
  email?:    string
  telefono?: string
}

export interface FastMailGeneraRecepcionRequest {
  remito:           string
  operacion:        "RECEPCION" | string
  fecha_pactada?:   string   // ISO date, ej: "2026-03-15"
  permite_parcial?: boolean
  contacto:         FastMailContacto
  productos:        FastMailProductoRecepcion[]
}

export interface FastMailGeneraRecepcionResponse {
  ok?:     boolean
  id?:     string
  error?:  string
  [key: string]: unknown
}

export interface FastMailEditarSucursalResponse {
  ok?:    boolean
  error?: string
  [key: string]: unknown
}

// Tipos legacy mantenidos para compatibilidad con routes existentes
export interface FastMailQuoteRequest {
  origen_cp:    string
  destino_cp:   string
  peso_g:       number
  valor:        number
  dimensiones?: { largo_cm: number; ancho_cm: number; alto_cm: number }
}

export interface FastMailQuoteResponse {
  servicios: Array<{
    codigo:     string
    nombre:     string
    plazo_dias: number
    precio:     number
  }>
  error?: string
}

export interface FastMailShipmentRequest {
  remitente:       FastMailContacto
  destinatario:    FastMailContacto
  peso_g:          number
  valor_declarado: number
  referencia?:     string
}

export interface FastMailShipmentResponse {
  id?:              string
  numero_guia?:     string
  estado?:          string
  url_etiqueta?:    string
  url_seguimiento?: string
  costo?:           number
  error?:           string
}

// ── Cliente ──────────────────────────────────────────────────────────────────

export class FastMailClient {
  private readonly baseUrl: string
  private readonly token:   string
  private readonly timeout: number

  constructor(config: FastMailConfig, credentials: FastMailCredentials) {
    this.baseUrl = config.base_url.replace(/\/$/, "")
    this.token   = credentials.token
    this.timeout = config.timeout_ms ?? 15_000
  }

  /** Body base con el api_token que va en todos los requests */
  private withToken(extra?: Record<string, unknown>): Record<string, unknown> {
    return { api_token: this.token, ...extra }
  }

  private async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(url, {
        method:  "POST",
        signal:  controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
        },
        body: JSON.stringify(this.withToken(body)),
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

  // ── Endpoints reales ───────────────────────────────────────────────────────

  /**
   * Verifica conectividad y valida el api_token.
   * Respuesta esperada: { server: "OK", user: "OK", cliente: "..." }
   */
  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await this.post<FastMailHealthCheckResponse>("/api/v2/dummy-test.json")
      if (res.server === "OK" && res.user === "OK") {
        const nombre = res.cliente ? ` — cliente: ${res.cliente}` : ""
        return { ok: true, message: `Conexión exitosa con FastMail API v2${nombre}` }
      }
      return { ok: false, message: `FastMail respondió inesperadamente: ${JSON.stringify(res)}` }
    } catch (err: any) {
      if (err.name === "AbortError") {
        return { ok: false, message: "FastMail: timeout — sin respuesta del servidor" }
      }
      return { ok: false, message: err.message }
    }
  }

  /** Consultar stock de productos por SKU */
  async consultarStock(skus: string[]): Promise<FastMailConsultarStockResponse> {
    return this.post<FastMailConsultarStockResponse>("/api/v2/consultarStock", { skus })
  }

  /** Listar códigos postales disponibles para envíos */
  async listarCps(): Promise<FastMailListarCpsResponse> {
    return this.post<FastMailListarCpsResponse>("/api/v2/listarCps")
  }

  /**
   * Generar remito de recepción (WMS).
   * Nota: URL provisoria — confirmar con FastMail si difiere de /api/v2/generaRecepcion.json
   */
  async generaRecepcion(req: FastMailGeneraRecepcionRequest): Promise<FastMailGeneraRecepcionResponse> {
    return this.post<FastMailGeneraRecepcionResponse>("/api/v2/generaRecepcion.json", req as unknown as Record<string, unknown>)
  }

  /** Editar datos de sucursal */
  async editarSucursal(data: Record<string, unknown>): Promise<FastMailEditarSucursalResponse> {
    return this.post<FastMailEditarSucursalResponse>("/api/v2/editarSucursal.json", data)
  }

  // ── Aliases legacy para compatibilidad con routes existentes ─────────────

  /** @deprecated Use healthCheck() para verificar conexión */
  async quote(req: FastMailQuoteRequest): Promise<FastMailQuoteResponse> {
    // La API real no tiene endpoint de cotización documentado públicamente.
    // Retorna error controlado en lugar de romper.
    return { servicios: [], error: "Cotización no disponible en FastMail API v2" }
  }

  /** @deprecated No hay endpoint de creación directa documentado */
  async createShipment(req: FastMailShipmentRequest): Promise<FastMailShipmentResponse> {
    return { error: "Creación de envío: usá generaRecepcion() con operacion=RECEPCION" }
  }
}

/** Crear cliente desde la configuración guardada en DB */
export function createFastMailClient(
  config: FastMailConfig,
  credentials: FastMailCredentials
): FastMailClient {
  if (!credentials.token) {
    throw new Error("FastMail: configurá el Token API en Transportistas → Fast Mail")
  }
  return new FastMailClient(config, credentials)
}
