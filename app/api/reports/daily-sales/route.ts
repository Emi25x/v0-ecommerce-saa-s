import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import ExcelJS from "exceljs"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { date, send_email = false, email_recipients = [] } = body

    // Usar fecha especificada o hoy
    const targetDate = date || new Date().toISOString().split("T")[0]
    const startOfDay = `${targetDate}T00:00:00Z`
    const endOfDay = `${targetDate}T23:59:59Z`

    console.log("[v0] Generando reporte de ventas para:", targetDate)

    // Obtener todas las cuentas ML
    const { data: accounts } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, access_token, nickname")

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: "No hay cuentas ML configuradas" }, { status: 400 })
    }

    // Obtener órdenes del día para todas las cuentas
    const allOrders: any[] = []
    
    for (const account of accounts) {
      try {
        const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${account.ml_user_id}&order.date_created.from=${startOfDay}&order.date_created.to=${endOfDay}`
        const response = await fetch(ordersUrl, {
          headers: { Authorization: `Bearer ${account.access_token}` }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.results && data.results.length > 0) {
            allOrders.push(...data.results)
          }
        }
      } catch (error) {
        console.error(`[v0] Error fetching orders for ${account.nickname}:`, error)
      }
    }

    console.log(`[v0] Total órdenes encontradas: ${allOrders.length}`)

    // Crear Excel con formato de la plantilla
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("Ventas")

    // Headers según la plantilla
    worksheet.columns = [
      { header: "IVA", key: "iva", width: 10 },
      { header: "CODIGO_PEDIDO", key: "codigo_pedido", width: 20 },
      { header: "CANTIDAD", key: "cantidad", width: 12 },
      { header: "EAN", key: "ean", width: 15 },
      { header: "PRECIO_VENTA", key: "precio_venta", width: 15 },
      { header: "CLIENTE_NOMBRE", key: "cliente_nombre", width: 30 },
      { header: "CLIENTE_IDENTIFICACION", key: "cliente_identificacion", width: 20 },
      { header: "CLIENTE_DIRECCION", key: "cliente_direccion", width: 40 },
      { header: "CLIENTE_POBLACION", key: "cliente_poblacion", width: 25 },
      { header: "CLIENTE_PROVINCIA", key: "cliente_provincia", width: 25 },
      { header: "CLIENTE_CODIGOPOSTAL", key: "cliente_codigopostal", width: 15 },
      { header: "CLIENTE_PAIS", key: "cliente_pais", width: 15 },
      { header: "CLIENTE_DIRECCIONCOMPLETA", key: "cliente_direccioncompleta", width: 50 }
    ]

    // Agregar filas de órdenes
    for (const order of allOrders) {
      for (const item of order.order_items || []) {
        // Usar seller_sku si existe (es el EAN), sino intentar buscar en DB
        let ean = item.item.seller_sku || ""
        
        // Si no hay seller_sku y hay seller_custom_field, intentar extraer EAN
        if (!ean && item.item.seller_custom_field) {
          ean = item.item.seller_custom_field
        }

        const shipping = order.shipping || {}
        const receiver = shipping.receiver_address || {}

        // Declare product variable here or replace with appropriate value
        const product = { ean: "" }; // Placeholder declaration

        worksheet.addRow({
          iva: 0,
          codigo_pedido: order.id,
          cantidad: item.quantity,
          ean: ean,
          precio_venta: item.unit_price,
          cliente_nombre: `${receiver.receiver_name || order.buyer?.nickname || ""}`,
          cliente_identificacion: receiver.receiver_phone || "",
          cliente_direccion: receiver.street_name || "",
          cliente_poblacion: receiver.city?.name || "",
          cliente_provincia: receiver.state?.name || "",
          cliente_codigopostal: receiver.zip_code || "",
          cliente_pais: "AR",
          cliente_direccioncompleta: `${receiver.street_name || ""} ${receiver.street_number || ""}, ${receiver.city?.name || ""}, ${receiver.state?.name || ""}`
        })
      }
    }

    // Generar buffer del Excel
    const buffer = await workbook.xlsx.writeBuffer()

    // Si se solicita envío por email
    if (send_email && email_recipients.length > 0) {
      // TODO: Integrar con Resend
      console.log("[v0] Enviando email a:", email_recipients)
      // Aquí irá la integración con Resend
    }

    // Devolver el archivo Excel
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ventas-${targetDate}.xlsx"`
      }
    })

  } catch (error) {
    console.error("[v0] Error generando reporte:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error generando reporte" },
      { status: 500 }
    )
  }
}
