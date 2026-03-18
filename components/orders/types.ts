export interface OrderItem {
  item: {
    id: string
    title: string
    seller_sku?: string
    sale_terms?: Array<{
      id: string
      value_name?: string
      value_struct?: {
        number: number
        unit: string
      }
    }>
    shipping?: {
      local_pick_up?: boolean
    }
    seller_custom_field?: string
    thumbnail?: string
    variation_id?: string
  }
  quantity: number
  unit_price: number
  full_unit_price: number
  manufacturing_days?: number
}

export interface ReturnShipping {
  id: number
  status: string
  tracking_number?: string
  status_history?: Array<{
    status: string
    substatus: string | null
    date: string
  }>
}

export interface ReturnDetails {
  claim_id: number
  type: string
  subtype: string | null
  status: string
  status_money: string
  shipping?: ReturnShipping
  date_created: string
  date_closed?: string
  refund_at?: string
}

export interface Order {
  id: number
  pack_id?: number
  status: string
  status_detail: string | null
  date_created: string
  date_closed: string | null
  order_items: OrderItem[]
  total_amount: number
  currency_id: string
  buyer: {
    id: number
    nickname: string
    email?: string
    phone?: {
      number: string
      area_code?: string
    }
    first_name?: string
    last_name?: string
  }
  shipping?: {
    id: number
    status: string
    substatus?: string | string[]
    mode?: string
    shipping_mode?: string
    logistic_type?: string
    shipping_option?: {
      id: string
      name?: string
      tag?: string
    }
    date_created?: string
  }
  payments?: Array<{
    id: number
    status: string
    status_detail: string
    payment_type_id: string
    transaction_amount: number
  }>
  account_nickname?: string
  account_id?: string
  manufacturing_ending_date?: string
  tags?: string[]
  cancel_detail?: {
    group: string
    code: string
    description: string
    requested_by: string
    date: string
    reason?: string
  }
  claim_id?: number
  claim?: {
    id: string
    type: string
    stage: string
    status: string
    reason_id: string
    date_created: string
    last_updated: string
  }
  _account?: { id: string; nickname: string }
  expiration_date?: string
  seller?: {
    id: string
  }
}

export interface PagingInfo {
  total: number
  limit: number
  offset: number
}

export interface Column {
  id: string
  label: string
  enabled: boolean
}

export interface SortConfig {
  key: string
  direction: "asc" | "desc"
}

export interface MlAccount {
  id: string
  nickname: string
  browser_preference: string | null
}

export interface MlBrowserModal {
  open: boolean
  orderId: number
  accountNickname: string
  browserPreference: string | null
  url: string
}

export interface ConfirmMarkReceived {
  orderId: number
  itemId: string
  orderDetails: Order | null
}

export interface OrderFiltersState {
  status: string
  date_from: string
  date_to: string
  generalStatus: string
  account: string
  availability: string
  timeFilter: string
}

export interface GeneralStatusCounts {
  all: number
  delivered: number
  toAgree: number
  cancelled: number
  waiting: number
  withClaim: number
  returned: number
  in_transit: number
  delayed: number
  ready: number
  pending_payment: number
  delivery_issues: number
  pending: number
}

export interface AvailabilityCounts {
  all: number
  today: number
  twentyFourHours: number
  fortyEightHours: number
  lastWeek: number
  rest: number
}

// --- Helper / pure functions used across components ---

export function hasActiveClaim(order: Order): boolean {
  return !!(order.claim_id && order.status !== "cancelled" && !order.tags?.includes("delivered"))
}

export function hasHandlingTime(order: Order): boolean {
  if (order.manufacturing_ending_date) {
    return true
  }
  const shippingMode = order.shipping?.mode || order.shipping?.shipping_mode
  if (shippingMode === "custom" || shippingMode === "me1" || !order.shipping?.id) {
    return false
  }
  return false
}

export function getRemainingDays(order: Order): number | null {
  if (!order.manufacturing_ending_date) return null
  const endDate = new Date(order.manufacturing_ending_date)
  const now = new Date()
  endDate.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  const diffTime = endDate.getTime() - now.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

export function getOrderAvailabilityStatus(order: Order): string {
  // PRIORITY 1: Returns/Refunds
  if (
    order.tags?.includes("returned") ||
    order.tags?.includes("return") ||
    (order.claim_id && order.tags?.includes("return")) ||
    (order.status === "cancelled" && order.cancel_detail?.reason === "buyer_return") ||
    (order.status === "cancelled" && order.tags?.includes("return"))
  ) {
    return "Devolucion"
  }

  // PRIORITY 2: Claims
  if (hasActiveClaim(order)) {
    return "Con reclamo"
  }

  // PRIORITY 3: Cancelled
  if (order.status === "cancelled") {
    return "Cancelado"
  }

  // PRIORITY 4: Delivered
  if (order.tags?.includes("delivered") || order.shipping?.status === "delivered") {
    return "Entregado"
  }

  // PRIORITY 5: No shipping
  if (order.tags?.includes("no_shipping")) {
    if (order.date_created) {
      const daysSincePurchase = Math.floor(
        (Date.now() - new Date(order.date_created).getTime()) / (1000 * 60 * 60 * 24),
      )
      if (daysSincePurchase >= 28) {
        return "Entregado"
      }
    }
    return "Acordar la entrega"
  }

  // PRIORITY 6: In-progress shipping states
  if (order.shipping?.substatus === "ready_for_pickup") {
    return "En punto de retiro"
  }
  if (order.shipping?.substatus === "printed") {
    return "Etiqueta impresa"
  }
  if (order.shipping?.status === "shipped") {
    return "En camino"
  }
  if (order.shipping?.status === "ready_to_ship") {
    return "Listo para enviar"
  }

  // PRIORITY 7: Delivery problems
  if (order.shipping?.status === "not_delivered" || order.shipping?.substatus === "returning_to_sender") {
    return "Problema de entrega"
  }

  // PRIORITY 8: Payment issues
  if (order.status === "payment_required" || order.status === "payment_in_process") {
    return "Pendiente de pago"
  }

  // PRIORITY 9: Handling time
  if (hasHandlingTime(order)) {
    const days = getRemainingDays(order)
    if (days !== null && days <= 0) {
      return "Demorado"
    }
    return "Esperando disponibilidad"
  }

  // PRIORITY 10: Default
  return "Pendiente"
}

export function getCancellationSubtype(order: Order): string | null {
  if (order.status !== "cancelled") return null

  if (order.cancel_detail) {
    const { group, description, requested_by } = order.cancel_detail

    switch (group) {
      case "buyer":
        return "Cancelado por comprador"
      case "seller":
        return "Cancelado por vendedor"
      case "delivery":
        return "Problema de entrega"
      case "shipment":
        return "Problema de envio"
      case "fraud":
        return "Fraude detectado"
      case "mediations":
        return "Mediacion"
      case "item":
        return "Problema con el producto"
      case "fiscal":
        return "Problema fiscal"
      case "internal":
        return requested_by === "buyer"
          ? "Cancelado por comprador"
          : requested_by === "seller"
            ? "Cancelado por vendedor"
            : "Cancelado por ML"
      default:
        if (description) {
          return description
        }
    }
  }

  if (order.tags?.includes("not_delivered")) {
    return "No entregado"
  }
  if (order.tags?.includes("returned")) {
    return "Devuelto"
  }

  const shippingStatus = order.shipping?.status
  const shippingSubstatus = order.shipping?.substatus

  if (shippingStatus === "not_delivered" || shippingSubstatus === "returning_to_sender") {
    return "Devuelto al vendedor"
  }
  if (shippingStatus === "cancelled") {
    return "Envio cancelado"
  }
  if (order.tags?.includes("claim") || order.claim_id) {
    return "Reclamo / Devolucion"
  }

  return null
}

export function getReturnStatusLabel(status: string): string {
  const statusLabels: Record<string, string> = {
    pending: "Pendiente",
    ready_to_ship: "Listo para enviar",
    shipped: "Enviado",
    delivered: "Entregado al vendedor",
    not_delivered: "No entregado",
    cancelled: "Cancelado",
    closed: "Cerrado",
  }
  return statusLabels[status] || status
}

export function getReturnMoneyStatusLabel(status: string): string {
  const statusLabels: Record<string, string> = {
    retained: "Retenido",
    refunded: "Reembolsado",
    available: "Disponible",
  }
  return statusLabels[status] || status
}

export function getHandlingTime(order: Order): string {
  const remainingDays = getRemainingDays(order)
  if (remainingDays !== null) {
    return remainingDays <= 0 ? "!Tiempo vencido!" : `Faltan ${remainingDays} dias`
  }

  for (const item of order.order_items) {
    if (item.manufacturing_days && item.manufacturing_days > 0) {
      return `${item.manufacturing_days} dias`
    }
  }

  for (const item of order.order_items) {
    const term = item.item.sale_terms?.find((t) => t.id === "MANUFACTURING_TIME")
    if (term?.value_struct) {
      return `${term.value_struct.number} ${term.value_struct.unit}`
    }
    if (term?.value_name) {
      return term.value_name
    }
  }

  return "Tiempo de disponibilidad"
}

export const SORT_OPTIONS = [
  { value: "date", label: "Fecha" },
  { value: "total", label: "Total" },
  { value: "order", label: "Orden" },
  { value: "customer", label: "Cliente" },
]

export const DEFAULT_COLUMNS: Column[] = [
  { id: "order", label: "Orden", enabled: true },
  { id: "customer", label: "Cliente", enabled: true },
  { id: "products", label: "Productos", enabled: true },
  { id: "sku", label: "SKU", enabled: true },
  { id: "availability", label: "Estado", enabled: true },
  { id: "items", label: "Items", enabled: true },
  { id: "total", label: "Total", enabled: true },
  { id: "status", label: "Estado / Pago", enabled: true },
  { id: "date", label: "Fecha", enabled: true },
  { id: "account", label: "Cuenta", enabled: true },
]
