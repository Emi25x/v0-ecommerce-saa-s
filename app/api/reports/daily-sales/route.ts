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
    
    // Debug: Ver estructura de la primera orden
    if (allOrders.length > 0) {
      console.log("[v0] Estructura de orden de ejemplo:", JSON.stringify({
        id: allOrders[0].id,
        buyer: allOrders[0].buyer,
        shipping: allOrders[0].shipping,
        order_items: allOrders[0].order_items?.map((item: any) => ({
          title: item.item.title,
          seller_sku: item.item.seller_sku,
          seller_custom_field: item.item.seller_custom_field,
          quantity: item.quantity,
          unit_price: item.unit_price
        }))
      }, null, 2))
    }

    // Crear Excel con formato de la plantilla
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("Ventas")

    // Headers según la plantilla (con columnas vacías para coincidir con formato exacto)
    const headers = [
      "IVA", "CODIGO_PEDIDO", "", "", "", "", "", "CANTIDAD", "", "", "", "", "", "", 
      "", "", "", "", "", "", "", "EAN", "", "", "", "PRECIO_VENTA", "", "", "", "", 
      "", "", "CLIENTE_NOMBRE", "CLIENTE_IDENTIFICACION", "CLIENTE_DIRECCION", 
      "CLIENTE_POBLACION", "CLIENTE_PROVINCIA", "CLIENTE_CODIGOPOSTAL", "CLIENTE_PAIS",
      "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", 
      "", "", "", "", "", "", "CLIENTE_DIRECCIONCOMPLETA"
    ]
    
    worksheet.addRow(headers)

    // Agregar filas de órdenes
    for (const order of allOrders) {
      // Obtener datos completos de envío si existe shipping ID
      let shippingData: any = {}
      if (order.shipping?.id && accounts.length > 0) {
        try {
          const shipmentUrl = `https://api.mercadolibre.com/shipments/${order.shipping.id}`
          const shipmentResponse = await fetch(shipmentUrl, {
            headers: { Authorization: `Bearer ${accounts[0].access_token}` }
          })
          if (shipmentResponse.ok) {
            shippingData = await shipmentResponse.json()
          }
        } catch (error) {
          console.error(`[v0] Error fetching shipment ${order.shipping.id}:`, error)
        }
      }

      // Obtener datos de facturación (CUIT/DNI del comprador)
      let billingInfo: any = {}
      if (accounts.length > 0) {
        try {
          const billingUrl = `https://api.mercadolibre.com/orders/${order.id}/billing_info`
          const billingResponse = await fetch(billingUrl, {
            headers: { 
              Authorization: `Bearer ${accounts[0].access_token}`,
              'x-version': '2'
            }
          })
          if (billingResponse.ok) {
            billingInfo = await billingResponse.json()
          }
        } catch (error) {
          console.error(`[v0] Error fetching billing info for order ${order.id}:`, error)
        }
      }

      for (const item of order.order_items || []) {
        // Debug: ver estructura del item para encontrar el EAN
        console.log("[v0] Item structure:", JSON.stringify({
          id: item.item.id,
          title: item.item.title,
          seller_sku: item.item.seller_sku,
          seller_custom_field: item.item.seller_custom_field,
          variation_id: item.item.variation_id,
          variation_attributes: item.item.variation_attributes,
          attributes: item.item.attributes
        }, null, 2))

        // Buscar EAN en diferentes campos posibles
        let ean = item.item.seller_sku || item.item.seller_custom_field || ""
        
        // Si no hay EAN, buscar en attributes (GTIN)
        if (!ean && item.item.attributes) {
          const gtinAttr = item.item.attributes.find((attr: any) => attr.id === 'GTIN' || attr.id === 'EAN')
          if (gtinAttr) {
            ean = gtinAttr.value_name || ""
          }
        }

        console.log("[v0] EAN encontrado:", ean, "para producto:", item.item.title)

        const receiver = shippingData.receiver_address || {}

        // Usar datos de billing_info (facturación) en lugar de shipping
        const billing = billingInfo.billing_info || billingInfo
        const billingAddress = billing.additional_info || {}
        
        // Crear fila con el formato exacto de la plantilla (62 columnas)
        const row = new Array(62).fill("")
        row[0] = 0 // IVA
        row[1] = String(order.id) // CODIGO_PEDIDO como texto para evitar notación científica
        row[7] = item.quantity // CANTIDAD
        row[21] = ean // EAN
        row[25] = item.unit_price // PRECIO_VENTA
        row[32] = billingAddress.receiver_name || order.buyer?.nickname || "" // CLIENTE_NOMBRE (datos fiscales)
        row[33] = billing.doc_number || "" // CLIENTE_IDENTIFICACION (CUIT/DNI)
        row[34] = billingAddress.street_name ? `${billingAddress.street_name} ${billingAddress.street_number || ""}` : "" // CLIENTE_DIRECCION
        row[35] = billingAddress.city?.name || "" // CLIENTE_POBLACION
        row[36] = billingAddress.state?.name || "" // CLIENTE_PROVINCIA
        row[37] = billingAddress.zip_code || "" // CLIENTE_CODIGOPOSTAL
        row[38] = "AR" // CLIENTE_PAIS
        row[61] = `${billingAddress.street_name || ""} ${billingAddress.street_number || ""}, ${billingAddress.city?.name || ""}, ${billingAddress.state?.name || ""}`.trim() // CLIENTE_DIRECCIONCOMPLETA

        worksheet.addRow(row)
      }
    }

    // Generar buffer del Excel
    const buffer = await workbook.xlsx.writeBuffer()

    // Si se solicita envío por email
    if (send_email && email_recipients.length > 0) {
      console.log("[v0] Enviando email a:", email_recipients)
      
      const resendApiKey = process.env.RESEND_API_KEY
      if (!resendApiKey) {
        return NextResponse.json({ error: "RESEND_API_KEY no configurada" }, { status: 500 })
      }

      try {
        const base64Excel = buffer.toString('base64')
        
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Reportes <onboarding@resend.dev>',
            to: email_recipients,
            subject: `Reporte de Ventas - ${targetDate}`,
            html: `
              <h2>Reporte de Ventas Diarias</h2>
              <p>Adjunto encontrarás el reporte de ventas del día ${targetDate}</p>
              <p>Total de órdenes: ${allOrders.length}</p>
            `,
            attachments: [{
              filename: `ventas-${targetDate}.xlsx`,
              content: base64Excel
            }]
          })
        })

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json()
          console.error("[v0] Error enviando email:", errorData)
          
          // Mensaje específico para error de dominio no verificado
          if (errorData.statusCode === 403 || errorData.message?.includes("verify a domain")) {
            return NextResponse.json({ 
              error: "Resend requiere verificar un dominio", 
              message: "Para enviar a múltiples destinatarios, verifica un dominio en resend.com/domains. Temporalmente, cambia el email a xemilianox@gmail.com para testing.",
              details: errorData 
            }, { status: 403 })
          }
          
          return NextResponse.json({ error: "Error enviando email", details: errorData }, { status: 500 })
        }

        console.log("[v0] Email enviado exitosamente")
        return NextResponse.json({ success: true, message: "Email enviado correctamente" })
      } catch (emailError) {
        console.error("[v0] Error en envío de email:", emailError)
        return NextResponse.json({ error: "Error enviando email" }, { status: 500 })
      }
    }

    // Devolver el archivo Excel para descarga
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
