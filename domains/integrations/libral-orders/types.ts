// ── Libral Order Export Types ─────────────────────────────────────────────────

/** Payload que espera el endpoint de crear pedido en Libral */
export interface LibralCreateOrderPayload {
  fecha: string // dd/MM/aaaa
  referencia: string // <platform_code>-<channel_order_id>
  plataforma: string // C1, C2, C3, C4, SP1, SP2
  nombrecliente: string // Razón social fija de la cuenta
  direccion: string
  codigopostal: string
  poblacion: string
  provincia: string
  lineas: LibralOrderLine[]
}

export interface LibralOrderLine {
  ean: string
  cantidad: number
}

/** Payload para eliminar pedido en Libral */
export interface LibralDeleteOrderPayload {
  referencia: string
}

/** Respuesta esperada de Libral */
export type LibralOrderResponse = "OK" | "KO" | string

/** Estados comerciales del pedido */
export type CommercialStatus = "pending" | "confirmed" | "paid" | "cancelled" | "shipped" | "delivered"

/** Estados de exportación a Libral */
export type LibralExportStatus =
  | "not_ready" // Sin platform_code o company_name configurado
  | "pending_export" // Listo para exportar en el próximo batch
  | "export_blocked" // Falta EAN en alguna línea
  | "sent" // Enviado exitosamente a Libral
  | "failed" // Error al enviar
  | "cancel_pending" // Enviado pero ahora cancelado, pendiente delete en Libral
  | "cancelled_in_erp" // Delete exitoso en Libral
  | "cancel_failed" // Error al hacer delete en Libral
  | "cancelled_not_sent" // Cancelado antes de enviar, no requiere acción

/** Orden unificada con datos de Libral */
export interface SalesOrder {
  id: string
  platform: string // mercadolibre, shopify
  platform_code: string | null // C1, C2, SP1, etc.
  platform_order_id: string
  account_id: string | null
  company_name: string | null
  libral_reference: string | null
  customer_name: string | null
  customer_address: Record<string, unknown> | null
  order_date: string
  total: number
  status: CommercialStatus
  payment_status: string | null
  libral_status: LibralExportStatus
  export_error: string | null
  last_export_attempt_at: string | null
  sent_to_libral: boolean
  libral_sent_at: string | null
  cancelled_at: string | null
  items: SalesOrderItem[]
}

export interface SalesOrderItem {
  id: string
  ean: string | null
  sku: string | null
  title: string
  quantity: number
  unit_price: number
}

/** Resultado del export batch */
export interface BatchExportResult {
  success: boolean
  total_eligible: number
  exported: number
  failed: number
  blocked: number
  errors: Array<{ order_id: string; reference: string; error: string }>
}
