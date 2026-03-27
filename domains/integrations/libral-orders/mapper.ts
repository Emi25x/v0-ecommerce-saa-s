/**
 * Maps unified orders to Libral payload format
 */

import type { LibralCreateOrderPayload } from "./types"

/**
 * Build a Libral order payload from a unified order row.
 * Returns null + reason if the order is not exportable.
 */
export function mapOrderToLibralPayload(order: {
  platform_code: string | null
  platform_order_id: string
  company_name: string | null
  order_date: string
  customer_address: Record<string, unknown> | null
  items: Array<{ ean: string | null; quantity: number }>
}): { payload: LibralCreateOrderPayload; reference: string } | { error: string } {
  // Validate platform_code
  if (!order.platform_code) {
    return { error: "Sin platform_code configurado para esta cuenta" }
  }

  // Validate company_name
  if (!order.company_name) {
    return { error: "Sin razón social configurada para esta cuenta" }
  }

  // Validate all items have EAN
  const missingEan = order.items.filter((item) => !item.ean)
  if (missingEan.length > 0) {
    return { error: `${missingEan.length} línea(s) sin EAN` }
  }

  // Build reference
  const reference = `${order.platform_code}-${order.platform_order_id}`

  // Format date as dd/MM/aaaa
  const d = new Date(order.order_date)
  const fecha = [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getFullYear()),
  ].join("/")

  // Address fields — never block export for missing address
  const addr = order.customer_address ?? {}
  const direccion = String(addr.street_name ?? addr.address ?? addr.line1 ?? "")
  const codigopostal = String(addr.zip_code ?? addr.postal_code ?? addr.zip ?? "")
  const poblacion = String(addr.city ?? addr.locality ?? "")
  const provincia = String(addr.state ?? addr.province ?? addr.region ?? "")

  const payload: LibralCreateOrderPayload = {
    fecha,
    referencia: reference,
    plataforma: order.platform_code,
    nombrecliente: order.company_name,
    direccion,
    codigopostal,
    poblacion,
    provincia,
    lineas: order.items.map((item) => ({
      ean: item.ean!,
      cantidad: item.quantity,
    })),
  }

  return { payload, reference }
}
