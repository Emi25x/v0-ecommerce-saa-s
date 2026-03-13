/**
 * FastMail Argentina — API v2 client
 *
 * Autenticación: `api_token` en el body de cada request POST (no Authorization header)
 * Base URL: https://epresislv.fastmail.com.ar
 *
 * Endpoints implementados (v2):
 *   POST /api/v2/dummy-test.json              — health check / verificar credenciales
 *   POST /api/v2/seguimiento.json             — tracking por remito o nro_guia
 *   POST /api/v2/guias.json                   — generar guía de envío
 *   POST /api/v2/cotizador.json               — cotizar envío
 *   POST /api/v2/seguro.json                  — calcular seguro por valor declarado
 *   POST /api/v2/servicios-cliente.json       — servicios habilitados por cliente
 *   POST /api/v2/precio-servicio.json         — precio por servicio y destino
 *   POST /api/v2/sucursalesByCliente.json     — sucursales del cliente
 *   POST /api/v2/localidades.json             — localidades, CPs y provincias
 *   POST /api/v2/listarTipoOperacion          — tipos de operación disponibles
 *   POST /api/v2/print-etiquetas-custom       — imprimir etiquetas (HTML)
 *   POST /api/v2/etiquetas-cliente            — listar etiquetas disponibles
 *   POST /api/v2/integracion.json             — registrar webhook de cambios de estado
 *   POST /api/v2/solicitarRetiro.json         — solicitar recolección
 *   POST /api/v2/generaRecepcion.json         — generar orden de recepción de stock (WMS)
 *   POST /api/v2/consultarStock               — consultar stock por SKU
 *   POST /api/v2/listarCps                    — listar códigos postales
 *   POST /api/v2/editarSucursal.json          — editar datos de sucursal
 */

export interface FastMailCredentials {
  token: string   // API token — requerido para todos los endpoints
  user?: string
  password?: string
}

export interface FastMailConfig {
  base_url:     string
  api_version?: string
  timeout_ms:   number
}

// ── Tipos de respuesta ───────────────────────────────────────────────────────

export interface FastMailHealthCheckResponse {
  server:   string   // "OK"
  user:     string   // "OK"
  cliente?: string   // Nombre del cliente, ej: "Presis Consultores"
  error?:   string
}

// ── Servicios ────────────────────────────────────────────────────────────────

export interface FastMailServicio {
  codigo_servicio: string
  descripcion:     string
  detalle_servicio: string
  tiempo_entrega:  number
  is_ecommerce:    number
  cotiza:          "SI" | "NO" | string
}

// ── Tipos de operación ────────────────────────────────────────────────────────

export interface FastMailTipoOperacion {
  id:     number
  codigo: string
  nombre: string
}

// ── Comprador / Destinatario ──────────────────────────────────────────────────

export interface FastMailComprador {
  empresa?:          string
  destinatario:      string
  hora_desde?:       string
  hora_hasta?:       string
  calle:             string
  altura:            number
  piso?:             string
  dpto?:             string
  localidad:         string
  provincia:         string
  info_adicional_1?: string
  info_adicional_2?: string
  info_adicional_3?: string
  info_adicional_4?: string
  info_adicional_5?: string
  cp:                number
  email?:            string
  celular?:          string
  cuit?:             string
  contenido?:        string
  latitud?:          string
  longitud?:         string
}

// ── Productos ─────────────────────────────────────────────────────────────────

export interface FastMailProducto {
  bultos:      number
  peso:        number
  descripcion: string
  dimensiones: {
    alto:        number
    largo:       number
    profundidad: number
  }
}

// ── Guías ─────────────────────────────────────────────────────────────────────

export interface FastMailGuiaRequest {
  codigo_sucursal:  string
  codigo_servicio:  string
  tiempo?:          string
  destino?:         string
  fragil?:          boolean
  remito?:          string
  guia_agente?:     string
  fob?:             string
  internacional:    boolean
  valor_declarado?: number
  isInversa:        boolean
  observaciones?:   string
  codigo_ceco?:     string
  contrareembolso?: number
  cobro_efectivo?:  number
  cobro_cheque?:    number
  precinto?:        string
  pago_en:          string          // ej: "DESTINO", "ORIGEN"
  tipo_operacion:   string          // ej: "ENT", "RET"
  is_urgente:       boolean
  valida_stock?:    boolean
  canal?:           string
  codigo_expreso?:  string
  comprador:        FastMailComprador
  productos:        FastMailProducto[]
}

export interface FastMailGuiaResponse {
  guia?:             number
  importe?:          number
  sub_zona_destino?: string
  remito?:           string
  zona?:             string
  error?:            string
  [key: string]:     unknown
}

// ── Cotizador ─────────────────────────────────────────────────────────────────

export interface FastMailCotizadorRequest {
  sucursal?:        string
  cp_entrega?:      string
  codigo_servicio?: string
  productos:        FastMailProducto[]
}

// ── Seguro ────────────────────────────────────────────────────────────────────

export interface FastMailSeguroResponse {
  status:   string
  message:  number   // valor del seguro calculado
  data?: {
    seguro_minimo:  number
    porcentaje:     number
    seguro_maximo:  number
  }
  error?: string
}

// ── Precio por servicio ───────────────────────────────────────────────────────

export interface FastMailPrecioServicioRequest {
  cp_destino: string
  sucursal:   string
  productos:  FastMailProducto[]
}

// ── Retiro ────────────────────────────────────────────────────────────────────

export interface FastMailSolicitarRetiroRequest {
  sucursal:       string
  fecha:          string   // ej: "2026-03-20"
  calle:          string
  altura:         string
  piso?:          string
  dpto?:          string
  localidad:      string
  provincia:      string
  cp:             number
  contacto:       string
  telefono?:      string
  mail?:          string
  franja:         "POR LA MAÑANA" | "TODO EL DIA" | "POR LA TARDE"
  peso:           string
  bultos:         string
  observaciones?: string
}

// ── Sucursal ──────────────────────────────────────────────────────────────────

export interface FastMailSucursalData {
  razon_social?:     string
  codigo_sucursal?:  string
  calle?:            string
  altura?:           number
  piso?:             string
  dpto?:             string
  localidad:         string
  provincia:         string
  cp:                number
  contacto?:         string
  telefono?:         string
  mail?:             string
  descripcion:       string
}

export interface FastMailEditarSucursalResponse {
  ok?:   boolean
  error?: string
  [key: string]: unknown
}

// ── Webhook ───────────────────────────────────────────────────────────────────

export interface FastMailIntegracionRequest {
  url:          string
  notificacion: boolean
  token?:       string
  usuario?:     string
  sucursal?:    string
}

// ── Etiquetas ─────────────────────────────────────────────────────────────────

export interface FastMailPrintEtiquetasRequest {
  tipo:       "fixed" | "custom"
  nombre:     string
  ides:       number[]
  is_remito?: boolean
}

// ── Recepción de stock (WMS) ──────────────────────────────────────────────────

export interface FastMailContacto {
  nombre:    string
  calle:     string
  cp:        string
  localidad: string
  provincia: string
  email?:    string
  telefono?: string
}

export interface FastMailProductoRecepcion {
  sku:         string
  descripcion: string
  cajas:       number
  cantidad:    number
  trazable:    boolean   // required: 1=SI, 0=NO
}

export interface FastMailGeneraRecepcionRequest {
  remito:          string
  operacion:       "RECEPCION" | string
  fecha_pactada:   string    // requerido, ej: "2026-03-22"
  permite_parcial: boolean   // requerido: 1=SI, 0=NO
  contacto:        FastMailContacto
  productos:       FastMailProductoRecepcion[]
}

export interface FastMailGeneraRecepcionResponse {
  ok?:   boolean
  id?:   string
  error?: string
  [key: string]: unknown
}

// ── Tracking ──────────────────────────────────────────────────────────────────

/** Forma real de la respuesta de /api/v2/seguimiento.json */
interface FastMailSeguimientoApiResponse {
  status?: string
  guia?: {
    fechas?: Array<{
      fecha:         string
      hora:          string
      estado:        string
      receptor:      string | null
      fecha_pactada: string | null
    }>
  }
  error?:   string
  message?: string
}

/** Formato normalizado expuesto por el cliente (compatible con routes existentes) */
export interface FastMailTrackingEvent {
  estado:      string
  descripcion: string
  ubicacion?:  string
  fecha:       string
}

export interface FastMailTrackingResponse {
  numero_guia?: string
  estado?:      string
  eventos?:     FastMailTrackingEvent[]
  error?:       string
}

// ── Stock / CPs ───────────────────────────────────────────────────────────────

export interface FastMailStockItem {
  sku:          string
  descripcion?: string
  stock:        number
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

// ── Tipos legacy para compatibilidad con routes existentes ────────────────────

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

// ── Cliente ───────────────────────────────────────────────────────────────────

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
    const url        = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), this.timeout)

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

  // ── Health check ───────────────────────────────────────────────────────────

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

  // ── Tracking ───────────────────────────────────────────────────────────────

  /**
   * Seguimiento de un envío por número de guía o remito del cliente.
   * Endpoint: POST /api/v2/seguimiento.json
   *
   * La respuesta real de la API es { status, guia: { fechas: [...] } }.
   * Se normaliza al formato FastMailTrackingResponse para mantener
   * compatibilidad con las routes existentes.
   */
  async getTracking(
    trackingNumber: string,
    useRemito = false
  ): Promise<FastMailTrackingResponse> {
    try {
      const param = useRemito ? { remito: trackingNumber } : { nro_guia: trackingNumber }
      const raw   = await this.post<FastMailSeguimientoApiResponse>("/api/v2/seguimiento.json", param)

      if (raw.error || (raw.status && raw.status !== "ok")) {
        return { error: raw.message ?? raw.error ?? `status: ${raw.status}` }
      }

      const fechas = raw.guia?.fechas ?? []

      const eventos: FastMailTrackingEvent[] = fechas.map(f => ({
        estado:      f.estado,
        descripcion: f.estado,                        // la API no provee descripción separada
        fecha:       `${f.fecha} ${f.hora}`.trim(),
        ubicacion:   undefined,
      }))

      const ultimoEstado = fechas.length ? fechas[fechas.length - 1].estado : undefined

      return {
        numero_guia: useRemito ? undefined : trackingNumber,
        estado:      ultimoEstado,
        eventos,
      }
    } catch (err: any) {
      return { error: err.message }
    }
  }

  // ── Guías ──────────────────────────────────────────────────────────────────

  /** Generar una guía de envío. POST /api/v2/guias.json */
  async generarGuia(req: FastMailGuiaRequest): Promise<FastMailGuiaResponse> {
    return this.post<FastMailGuiaResponse>("/api/v2/guias.json", req as unknown as Record<string, unknown>)
  }

  // ── Cotizador ──────────────────────────────────────────────────────────────

  /** Calcular precio de envío. POST /api/v2/cotizador.json */
  async cotizador(req: FastMailCotizadorRequest): Promise<unknown> {
    return this.post<unknown>("/api/v2/cotizador.json", req as unknown as Record<string, unknown>)
  }

  // ── Seguro ─────────────────────────────────────────────────────────────────

  /** Calcular valor del seguro según valor declarado. POST /api/v2/seguro.json */
  async seguro(valor_declarado: number): Promise<FastMailSeguroResponse> {
    return this.post<FastMailSeguroResponse>("/api/v2/seguro.json", { valor_declarado })
  }

  // ── Servicios ──────────────────────────────────────────────────────────────

  /** Servicios habilitados para el cliente. POST /api/v2/servicios-cliente.json */
  async serviciosCliente(): Promise<FastMailServicio[]> {
    return this.post<FastMailServicio[]>("/api/v2/servicios-cliente.json")
  }

  /** Precio por servicio según destino y productos. POST /api/v2/precio-servicio.json */
  async precioServicio(req: FastMailPrecioServicioRequest): Promise<unknown> {
    return this.post<unknown>("/api/v2/precio-servicio.json", req as unknown as Record<string, unknown>)
  }

  /** Tipos de operación disponibles. POST /api/v2/listarTipoOperacion */
  async listarTipoOperacion(): Promise<{ status: string; message: FastMailTipoOperacion }> {
    return this.post<{ status: string; message: FastMailTipoOperacion }>("/api/v2/listarTipoOperacion")
  }

  // ── Sucursales / Localidades ───────────────────────────────────────────────

  /** Sucursales asociadas al cliente. POST /api/v2/sucursalesByCliente.json */
  async sucursalesByCliente(): Promise<unknown> {
    return this.post<unknown>("/api/v2/sucursalesByCliente.json")
  }

  /** Localidades, CPs y provincias disponibles. POST /api/v2/localidades.json */
  async localidades(): Promise<unknown> {
    return this.post<unknown>("/api/v2/localidades.json")
  }

  // ── Etiquetas ──────────────────────────────────────────────────────────────

  /**
   * Imprimir etiquetas en formato HTML.
   * tipo: "fixed" = predefinida por la logística | "custom" = personalizada del cliente
   * POST /api/v2/print-etiquetas-custom
   */
  async printEtiquetasCustom(req: FastMailPrintEtiquetasRequest): Promise<unknown> {
    return this.post<unknown>("/api/v2/print-etiquetas-custom", req as unknown as Record<string, unknown>)
  }

  /** Listar etiquetas disponibles (fixed y custom). POST /api/v2/etiquetas-cliente */
  async etiquetasCliente(): Promise<unknown> {
    return this.post<unknown>("/api/v2/etiquetas-cliente")
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  /**
   * Registrar o actualizar webhook para recibir cambios de estado de guías.
   * El sistema enviará: { usuario, token, codigo_estado, remito, guia }
   * Se debe responder con HTTP 200 para confirmar recepción.
   * POST /api/v2/integracion.json
   */
  async integracion(req: FastMailIntegracionRequest): Promise<unknown> {
    return this.post<unknown>("/api/v2/integracion.json", req as unknown as Record<string, unknown>)
  }

  // ── Retiro ─────────────────────────────────────────────────────────────────

  /** Solicitar recolección en domicilio. POST /api/v2/solicitarRetiro.json */
  async solicitarRetiro(req: FastMailSolicitarRetiroRequest): Promise<unknown> {
    return this.post<unknown>("/api/v2/solicitarRetiro.json", req as unknown as Record<string, unknown>)
  }

  // ── Stock / CPs ────────────────────────────────────────────────────────────

  /** Consultar stock de productos por SKU. POST /api/v2/consultarStock */
  async consultarStock(skus: string[]): Promise<FastMailConsultarStockResponse> {
    return this.post<FastMailConsultarStockResponse>("/api/v2/consultarStock", { skus })
  }

  /** Listar códigos postales disponibles para envíos. POST /api/v2/listarCps */
  async listarCps(): Promise<FastMailListarCpsResponse> {
    return this.post<FastMailListarCpsResponse>("/api/v2/listarCps")
  }

  // ── Recepción de stock (WMS) ───────────────────────────────────────────────

  /**
   * Generar orden de recepción de mercadería en depósito.
   * POST /api/v2/generaRecepcion.json
   */
  async generaRecepcion(req: FastMailGeneraRecepcionRequest): Promise<FastMailGeneraRecepcionResponse> {
    return this.post<FastMailGeneraRecepcionResponse>(
      "/api/v2/generaRecepcion.json",
      req as unknown as Record<string, unknown>
    )
  }

  // ── Sucursal ───────────────────────────────────────────────────────────────

  /** Editar datos de una sucursal. POST /api/v2/editarSucursal.json */
  async editarSucursal(data: FastMailSucursalData): Promise<FastMailEditarSucursalResponse> {
    return this.post<FastMailEditarSucursalResponse>(
      "/api/v2/editarSucursal.json",
      data as unknown as Record<string, unknown>
    )
  }

  // ── Legacy ─────────────────────────────────────────────────────────────────

  /**
   * Cotización via cotizador().
   * Mapea FastMailQuoteRequest → FastMailCotizadorRequest y normaliza la respuesta.
   */
  async quote(req: FastMailQuoteRequest): Promise<FastMailQuoteResponse> {
    const pesoKg = req.peso_g / 1000
    const dim    = req.dimensiones

    const cotReq: FastMailCotizadorRequest = {
      cp_entrega: req.destino_cp,
      productos: [{
        bultos:      1,
        peso:        pesoKg,
        descripcion: "Paquete",
        dimensiones: {
          alto:        dim?.alto_cm      ?? 10,
          largo:       dim?.largo_cm     ?? 20,
          profundidad: dim?.ancho_cm     ?? 15,
        },
      }],
    }

    const raw = await this.cotizador(cotReq) as any

    // Normalizar respuesta — FastMail puede devolver array en raw.message o raw.servicios
    const items: any[] = Array.isArray(raw?.message)
      ? raw.message
      : Array.isArray(raw?.servicios)
      ? raw.servicios
      : Array.isArray(raw?.data)
      ? raw.data
      : raw?.precio != null
      ? [raw]
      : []

    if (!items.length && raw?.error) {
      return { servicios: [], error: String(raw.error) }
    }

    const servicios = items.map((s: any) => ({
      codigo:     String(s.codigo_servicio ?? s.servicio ?? s.codigo ?? "STD"),
      nombre:     String(s.nombre_servicio ?? s.nombre   ?? s.servicio ?? "Estándar"),
      plazo_dias: Number(s.plazo_dias ?? s.plazo ?? 0),
      precio:     Number(s.precio     ?? s.importe ?? s.costo ?? 0),
    }))

    return { servicios }
  }

  /**
   * @deprecated Usá generarGuia() para crear envíos.
   * Mantenido para compatibilidad con la route /api/envios/create-shipment.
   */
  async createShipment(_req: FastMailShipmentRequest): Promise<FastMailShipmentResponse> {
    return { error: "Creación de envío: usá generarGuia() con los datos del destinatario" }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

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
