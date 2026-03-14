/**
 * FastMail Argentina — API v2 client
 *
 * Autenticación: `api_token` en el body de cada request POST (no Authorization header)
 * Base URL: https://epresislv.fastmail.com.ar
 *
 * Endpoints implementados (v2) — confirmados con manual oficial:
 *   POST /api/v2/dummy-test.json                      — health check / verificar credenciales
 *   POST /api/v2/seguimiento.json                     — tracking por remito o nro_guia
 *   POST /api/v2/guias.json                           — generar guía de envío
 *   POST /api/v2/cotizador.json                       — cotizar envío (params internos no documentados)
 *   POST /api/v2/seguro.json                          — calcular seguro por valor declarado
 *   POST /api/v2/servicios-cliente.json               — servicios habilitados por cliente
 *   POST /api/v2/serviciosByIntegracionPresis.json    — servicios via integración Presis
 *   POST /api/v2/precio-servicio.json                 — precio por servicio y destino
 *   POST /api/v2/sucursalesByCliente.json             — sucursales del cliente
 *   POST /api/v2/localidades.json                     — localidades, CPs y provincias
 *   POST /api/v2/listarTipoOperacion                  — tipos de operación disponibles
 *   POST /api/v2/print-etiquetas-custom               — imprimir etiquetas (HTML)
 *   POST /api/v2/etiquetas-cliente                    — listar etiquetas disponibles
 *   POST /api/v2/integracion.json                     — registrar webhook de cambios de estado
 *   POST /api/v2/solicitarRetiro.json                 — solicitar recolección
 *   POST /api/v2/generaRecepcion.json                 — generar orden de recepción de stock (WMS)
 *   POST /api/v2/consultarStock                       — consultar stock por SKU
 *   POST /api/v2/listarCps                            — listar códigos postales
 *   POST /api/v2/editarSucursal.json                  — editar datos de sucursal
 *
 * Notas del manual v2:
 *   - FastMailGuiaRequest usa valorDeclarado (camelCase), no valor_declarado
 *   - FastMailConfig.sucursal es requerido por guías, cotizador y precio-servicio
 *   - Tracking response: { status, guia: { fechas: [{ fecha, hora, estado, receptor, fecha_pactada }] } }
 *   - Webhook payload: { usuario, token, codigo_estado, remito, guia }
 */

export interface FastMailCredentials {
  token: string   // API token — requerido para todos los endpoints
  user?: string
  password?: string
}

export interface FastMailConfig {
  base_url:        string
  api_version?:    string
  timeout_ms:      number
  sucursal?:       string   // Código de sucursal del cliente (requerido por cotizador, guías, etc.)
  servicio_default?: string // Código de servicio por defecto para crear guías
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

/** Respuesta de servicios-cp.json (v1) — servicios disponibles por CP destino */
export interface FastMailServicioCp {
  id:          number
  cod_serv:    string
  descripcion: string
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
  valorDeclarado?:  number   // camelCase según manual v2
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
  cp_origen?:       string   // CP de origen (sucursal o remitente) — requerido por la API
  cp_destino?:      string   // CP de destino — cotizador.json usa cp_destino (no cp_entrega)
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
  servicio?:       string   // Código de servicio seleccionado; si no se envía, usa servicio_default de config
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

// ── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Extrae el precio de la respuesta cruda del cotizador.
 * FastMail puede devolver distintos formatos según la versión/configuración:
 *   { precio: 1234 }
 *   { message: 1234 }
 *   { message: [{ precio: 1234, ... }] }
 *   { message: { precio: 1234, ... } }
 *   { importe: 1234 }
 *   { costo: 1234 }
 * Retorna null si no encuentra un precio válido o si hay error.
 */
function parsePrecioFromRaw(raw: any): number | null {
  if (!raw || raw.error) return null

  // Precio directo en el objeto raíz
  const directo = raw.precio ?? raw.importe ?? raw.costo
  if (directo != null && Number(directo) > 0) return Number(directo)

  // message puede ser número, objeto o array
  const msg = raw.message
  if (msg != null) {
    if (typeof msg === "number" && msg > 0) return msg

    // message puede ser un precio como string: "850.00"
    if (typeof msg === "string" && Number(msg) > 0) return Number(msg)

    if (typeof msg === "object" && !Array.isArray(msg)) {
      const p = msg.precio ?? msg.importe ?? msg.costo
      if (p != null && Number(p) > 0) return Number(p)
    }

    if (Array.isArray(msg) && msg.length > 0) {
      const first = msg[0]
      const p     = first?.precio ?? first?.importe ?? first?.costo
      if (p != null && Number(p) > 0) return Number(p)
    }
  }

  // data puede ser array u objeto
  if (raw.data != null) {
    if (Array.isArray(raw.data) && raw.data.length > 0) {
      const p = raw.data[0]?.precio ?? raw.data[0]?.importe ?? raw.data[0]?.costo
      if (p != null && Number(p) > 0) return Number(p)
    } else if (typeof raw.data === "object" && !Array.isArray(raw.data)) {
      const p = raw.data?.precio ?? raw.data?.importe ?? raw.data?.costo
      if (p != null && Number(p) > 0) return Number(p)
    }
  }

  // servicios como array
  if (Array.isArray(raw.servicios) && raw.servicios.length > 0) {
    const p = raw.servicios[0]?.precio ?? raw.servicios[0]?.importe
    if (p != null && Number(p) > 0) return Number(p)
  }

  return null
}

/**
 * Normaliza la respuesta de precio-servicio.json.
 * Posibles formatos:
 *   [ { codigo_servicio, nombre_servicio|descripcion, precio|importe, plazo_dias }, ... ]
 *   { servicios: [...] }
 *   { message: [...] }
 *   { data: [...] }
 */
function parsePrecioServicioResponse(raw: any): FastMailQuoteResponse["servicios"] {
  if (!raw || raw.error) return []

  const candidates: any[] =
    Array.isArray(raw)           ? raw          :
    Array.isArray(raw.servicios) ? raw.servicios :
    Array.isArray(raw.message)   ? raw.message   :
    Array.isArray(raw.data)      ? raw.data      :
    []

  return candidates
    .filter(s => {
      const precio = Number(s.precio ?? s.importe ?? s.costo ?? 0)
      return precio > 0
    })
    .map(s => ({
      codigo:     String(s.codigo_servicio ?? s.codigo ?? s.servicio ?? ""),
      nombre:     String(s.nombre_servicio ?? s.nombre ?? s.descripcion ?? s.servicio ?? "Servicio"),
      plazo_dias: Number(s.plazo_dias ?? s.plazo ?? 0),
      precio:     Number(s.precio     ?? s.importe ?? s.costo ?? 0),
    }))
}

// ── Cliente ───────────────────────────────────────────────────────────────────

export class FastMailClient {
  private readonly baseUrl:        string
  private readonly token:          string
  private readonly timeout:        number
  private readonly sucursal:       string
  private readonly servicioDefault: string

  constructor(config: FastMailConfig, credentials: FastMailCredentials) {
    this.baseUrl        = config.base_url.replace(/\/$/, "")
    this.token          = credentials.token
    this.timeout        = config.timeout_ms ?? 15_000
    this.sucursal       = config.sucursal       ?? ""
    this.servicioDefault = config.servicio_default ?? ""
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

  /**
   * Servicios disponibles para un CP destino (v1).
   * Usar solo si el tipo de facturación es "por cordón".
   * Devuelve los servicios ecommerce que cubren ese CP.
   * POST /api/v1/public/servicios-cp.json
   */
  async serviciosByCp(cp_entrega: string): Promise<FastMailServicioCp[]> {
    return this.post<FastMailServicioCp[]>("/api/v1/public/servicios-cp.json", {
      sucursal: this.sucursal,
      cp_entrega,
    })
  }

  /** Servicios del cliente via integración Presis. POST /api/v2/serviciosByIntegracionPresis.json */
  async serviciosByIntegracionPresis(): Promise<FastMailServicio[]> {
    return this.post<FastMailServicio[]>("/api/v2/serviciosByIntegracionPresis.json")
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
   * Cotización usando precio-servicio.json (un solo llamado, devuelve todos
   * los servicios disponibles para el tramo).
   * Fallback: cotizador.json por servicio en paralelo si precio-servicio falla.
   */
  async quote(req: FastMailQuoteRequest): Promise<FastMailQuoteResponse> {
    const pesoKg = req.peso_g / 1000
    const dim    = req.dimensiones

    const productos: FastMailProducto[] = [{
      bultos:      1,
      peso:        pesoKg,
      descripcion: "Paquete",
      dimensiones: {
        alto:        dim?.alto_cm      ?? 10,
        largo:       dim?.largo_cm     ?? 20,
        profundidad: dim?.ancho_cm     ?? 15,
      },
    }]

    // ── Intento 1: precio-servicio.json (v2) ─────────────────────────────────
    // Un solo llamado. Devuelve precios por servicio para el tramo.
    // Solo funciona si el cliente tiene este endpoint habilitado.
    if (this.sucursal) {
      try {
        const raw = await this.precioServicio({
          cp_destino: req.destino_cp,
          sucursal:   this.sucursal,
          productos,
        }) as any

        const servicios = parsePrecioServicioResponse(raw)
        console.log(`[FastMail][quote] precio-servicio: ${servicios.length} servicios para CP ${req.destino_cp}`)
        if (servicios.length > 0) return { servicios }
      } catch (e: any) {
        console.warn("[FastMail][quote] precio-servicio falló:", e?.message)
      }
    }

    // Helper: obtener candidatos de serviciosCliente
    const getCandidatosDeCliente = async (): Promise<Array<{ codigo: string; nombre: string }>> => {
      try {
        const rawLista = await this.serviciosCliente() as any
        // La API puede devolver array directo o envuelto en { servicios, services, message, data }
        const lista: FastMailServicio[] =
          Array.isArray(rawLista)              ? rawLista              :
          Array.isArray(rawLista?.servicios)   ? rawLista.servicios    :
          Array.isArray(rawLista?.services)    ? rawLista.services     :
          Array.isArray(rawLista?.message)     ? rawLista.message      :
          Array.isArray(rawLista?.data)        ? rawLista.data         : []
        if (lista.length === 0) return []
        const cotizables = lista.filter(s =>
          String(s.cotiza).toUpperCase() === "SI" || String(s.cotiza) === "1" || s.cotiza === true as any
        )
        const fuente = cotizables.length > 0 ? cotizables : lista
        console.log(`[FastMail][quote] serviciosCliente: ${fuente.length} candidatos`)
        return fuente.map(s => ({
          codigo: s.codigo_servicio,
          nombre: s.descripcion ?? s.detalle_servicio ?? s.codigo_servicio,
        }))
      } catch (e: any) {
        console.warn("[FastMail][quote] serviciosCliente falló:", e?.message)
        return []
      }
    }

    // Helper: cotizar candidatos con cotizador.json
    const cotizarCandidatos = async (
      candidatos: Array<{ codigo: string; nombre: string }>
    ): Promise<FastMailQuoteResponse["servicios"]> => {
      const resultados = await Promise.allSettled(
        candidatos.map(async ({ codigo, nombre }) => {
          const raw = await this.cotizador({
            cp_origen:       req.origen_cp,
            cp_destino:      req.destino_cp,
            sucursal:        this.sucursal || undefined,
            codigo_servicio: codigo,
            productos,
          }) as any
          const precio = parsePrecioFromRaw(raw)
          console.log(`[FastMail][cotizador] servicio=${codigo} precio=${precio} raw.error=${raw?.error}`)
          if (precio === null) return null
          return {
            codigo,
            nombre:     raw.nombre_servicio ?? raw.nombre ?? nombre,
            plazo_dias: Number(raw.plazo_dias ?? raw.plazo ?? 0),
            precio,
          }
        })
      )
      return resultados
        .filter((r): r is PromiseFulfilledResult<NonNullable<any>> =>
          r.status === "fulfilled" && r.value !== null
        )
        .map(r => r.value)
    }

    // ── Intento 2: servicios-cp.json (v1) + cotizador.json ───────────────────
    // Para clientes con facturación "por cordón".
    if (this.sucursal) {
      try {
        const porCp = await this.serviciosByCp(req.destino_cp)
        if (Array.isArray(porCp) && porCp.length > 0) {
          const candidatosCp = porCp.map(s => ({ codigo: s.cod_serv, nombre: s.descripcion }))
          console.log(`[FastMail][quote] serviciosByCp(${req.destino_cp}): ${candidatosCp.length} candidatos`)
          const servicios = await cotizarCandidatos(candidatosCp)
          if (servicios.length > 0) return { servicios }
        } else {
          console.log(`[FastMail][quote] serviciosByCp(${req.destino_cp}): sin resultados`)
        }
      } catch (e: any) {
        console.warn("[FastMail][quote] serviciosByCp falló:", e?.message)
      }
    }

    // ── Intento 3 (fallback final): servicios-cliente.json + cotizador.json ──
    let candidatosCliente: Array<{ codigo: string; nombre: string }> = []

    if (this.servicioDefault) {
      candidatosCliente = [{ codigo: this.servicioDefault, nombre: this.servicioDefault }]
    }

    const desdeCliente = await getCandidatosDeCliente()
    if (desdeCliente.length > 0) {
      // Merge: desdeCliente tiene prioridad, servicioDefault como respaldo
      const codigosCliente = new Set(desdeCliente.map(c => c.codigo))
      candidatosCliente = [
        ...desdeCliente,
        ...candidatosCliente.filter(c => !codigosCliente.has(c.codigo)),
      ]
    }

    if (candidatosCliente.length === 0) {
      return { servicios: [], error: "Configurá un código de servicio en FastMail → Transportistas" }
    }

    const servicios = await cotizarCandidatos(candidatosCliente)
    return { servicios }
  }

  /**
   * Alias compatible con /api/envios/create-shipment.
   * Mapea FastMailShipmentRequest → FastMailGuiaRequest y llama a generarGuia().
   * Usa defaults de config: sucursal, servicio_default, pago_en=DESTINO, tipo_operacion=ENT.
   */
  async createShipment(req: FastMailShipmentRequest): Promise<FastMailShipmentResponse> {
    // La UI puede enviar 'direccion' (nombre del campo en el form) en lugar de 'calle'
    const calleRaw = req.destinatario.calle ?? (req.destinatario as any).direccion ?? ""
    // Separar calle y altura del destinatario (ej: "Av Rivadavia 1234" → calle + 1234)
    const matchAltura = calleRaw.match(/^(.*?)\s+(\d+)\s*$/)
    const calle  = matchAltura ? matchAltura[1].trim() : calleRaw
    const altura = matchAltura ? parseInt(matchAltura[2]) : 0

    const guiaReq: FastMailGuiaRequest = {
      codigo_sucursal: this.sucursal,
      codigo_servicio: req.servicio || this.servicioDefault || "STD",
      internacional:   false,
      valorDeclarado:  req.valor_declarado,
      isInversa:       false,
      pago_en:         "DESTINO",
      tipo_operacion:  "ENT",
      is_urgente:      false,
      remito:          req.referencia ?? undefined,
      comprador: {
        destinatario: req.destinatario.nombre,
        calle,
        altura,
        localidad:    req.destinatario.localidad,
        provincia:    req.destinatario.provincia,
        cp:           parseInt(req.destinatario.cp as any) || 0,
        email:        req.destinatario.email    ?? undefined,
        celular:      req.destinatario.telefono ?? undefined,
      },
      productos: [{
        bultos:      1,
        peso:        req.peso_g / 1000,
        descripcion: "Paquete",
        dimensiones: { alto: 10, largo: 20, profundidad: 15 },
      }],
    }

    try {
      const res = await this.generarGuia(guiaReq)
      if (res.error) return { error: String(res.error) }
      const nroGuia = String(res.guia ?? "")
      return {
        id:          nroGuia,
        numero_guia: nroGuia,
        estado:      "pending",
        costo:       res.importe ?? undefined,
      }
    } catch (err: any) {
      return { error: err.message }
    }
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
