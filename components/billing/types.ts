// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArcaConfig {
  id: string
  cuit: string
  razon_social: string
  nombre_empresa: string | null
  domicilio_fiscal: string
  punto_venta: number
  condicion_iva: string
  ambiente: string
  wsaa_expires_at: string | null
  logo_url?: string | null
  telefono?: string | null
  email?: string | null
  web?: string | null
  instagram?: string | null
  facebook?: string | null
  whatsapp?: string | null
  nota_factura?: string | null
  datos_pago?: string | null
  factura_opciones?: any
  iva_default?: number
  cert_pem?: string | null
  clave_pem?: string | null
}

export interface FacturaItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  alicuota_iva: 0 | 10.5 | 21 | 27
  subtotal: number
  iva: number
}

export interface Factura {
  id: string
  tipo_comprobante: number
  punto_venta: number
  numero: number
  fecha: string
  cae: string | null
  cae_vencimiento: string | null
  razon_social_receptor: string
  nro_doc_receptor: string
  importe_total: number
  importe_neto: number
  importe_iva: number
  estado: string
  error_mensaje: string | null
  items: FacturaItem[]
  orden_id: string | null
  created_at: string
}

export interface NewFormState {
  tipo_comprobante: string
  concepto: string
  tipo_doc_receptor: string
  nro_doc_receptor: string
  receptor_nombre: string
  receptor_domicilio: string
  receptor_condicion_iva: string
  moneda: string
}

export interface ConfigFormState {
  id: string
  cuit: string
  razon_social: string
  nombre_empresa: string
  domicilio_fiscal: string
  punto_venta: string
  condicion_iva: string
  ambiente: string
  cert_pem: string
  clave_pem: string
  telefono: string
  email: string
  web: string
  instagram: string
  facebook: string
  whatsapp: string
  iva_default: number
  nota_factura: string
  datos_pago: string
  logo_url: string
  factura_opciones: {
    mostrar_logo: boolean
    mostrar_datos_contacto: boolean
    mostrar_redes: boolean
    mostrar_nota: boolean
    mostrar_datos_pago: boolean
    mostrar_domicilio: boolean
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const TIPO_COMPROBANTE: Record<number, { letra: string; label: string }> = {
  1: { letra: "A", label: "Factura A" },
  6: { letra: "B", label: "Factura B" },
  11: { letra: "C", label: "Factura C" },
}

// Segun FEParamGetCondicionIvaReceptor de ARCA (RG 5616)
export const CONDICION_IVA_OPTS = [
  { value: "consumidor_final", label: "Consumidor Final (5)" },
  { value: "responsable_inscripto", label: "Responsable Inscripto (1)" },
  { value: "monotributo", label: "Responsable Monotributo (6)" },
  { value: "exento", label: "IVA Sujeto Exento (4)" },
  { value: "no_categorizado", label: "Sujeto No Categorizado (7)" },
  { value: "monotributista_social", label: "Monotributista Social (13)" },
  { value: "no_alcanzado", label: "IVA No Alcanzado (15)" },
  { value: "proveedor_exterior", label: "Proveedor del Exterior (8)" },
  { value: "cliente_exterior", label: "Cliente del Exterior (9)" },
  { value: "liberado", label: "IVA Liberado Ley 19640 (10)" },
  { value: "monotributo_trabajador_independiente", label: "Monotributo Trab. Independiente (16)" },
]

// Segun FEParamGetTiposDoc de ARCA
export const TIPO_DOC_OPTS = [
  { value: "99", label: "Sin documento / Consumidor Final" },
  { value: "96", label: "DNI" },
  { value: "80", label: "CUIT" },
  { value: "86", label: "CUIL" },
  { value: "87", label: "CDI" },
  { value: "89", label: "LE" },
  { value: "90", label: "LC" },
  { value: "91", label: "CI Extranjera" },
  { value: "92", label: "en tramite" },
  { value: "95", label: "Pasaporte" },
]

export const IVA_OPTS: Array<{ value: 0 | 10.5 | 21 | 27; label: string }> = [
  { value: 0, label: "Exento (0%)" },
  { value: 10.5, label: "10.5%" },
  { value: 21, label: "21%" },
  { value: 27, label: "27%" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n)
}

export function fmtFecha(s: string) {
  if (!s) return "\u2014"
  const [y, m, d] = s.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

export function nroFmt(pv: number, num: number) {
  return `${String(pv).padStart(4, "0")}-${String(num).padStart(8, "0")}`
}

export function calcItem(item: Partial<FacturaItem>): FacturaItem {
  const cantidad = Number(item.cantidad || 0)
  const precio = Number(item.precio_unitario || 0)
  const alicuota = Number(item.alicuota_iva ?? 21) as 0 | 10.5 | 21 | 27
  const subtotal = parseFloat((cantidad * precio).toFixed(2))
  const iva = alicuota === 0 ? 0 : parseFloat(((subtotal * alicuota) / 100).toFixed(2))
  return {
    descripcion: item.descripcion || "",
    cantidad,
    precio_unitario: precio,
    alicuota_iva: alicuota,
    subtotal,
    iva,
  }
}

export const EMPTY_ITEM = (ivaDefault: number = 21): Partial<FacturaItem> => ({
  descripcion: "",
  cantidad: 1,
  precio_unitario: 0,
  alicuota_iva: ivaDefault as 0 | 10.5 | 21 | 27,
  subtotal: 0,
  iva: 0,
})

export const EMPTY_CONFIG_FORM = (): ConfigFormState => ({
  id: "",
  // ARCA
  cuit: "",
  razon_social: "",
  nombre_empresa: "",
  domicilio_fiscal: "",
  punto_venta: "1",
  condicion_iva: "responsable_inscripto",
  ambiente: "homologacion",
  cert_pem: "",
  clave_pem: "",
  // Contacto y redes
  telefono: "",
  email: "",
  web: "",
  instagram: "",
  facebook: "",
  whatsapp: "",
  // Contenido de la factura
  iva_default: 21,
  nota_factura: "",
  datos_pago: "",
  // Logo
  logo_url: "",
  // Visibilidad
  factura_opciones: {
    mostrar_logo: true,
    mostrar_datos_contacto: true,
    mostrar_redes: true,
    mostrar_nota: true,
    mostrar_datos_pago: true,
    mostrar_domicilio: true,
  },
})

export const LIMIT = 20
