import { createClient } from "@/lib/supabase/server"
import ExcelJS from "exceljs"

export interface DailySalesResult {
  success: boolean
  buffer: Buffer
  orderCount: number
  error?: string
}

/**
 * Generates the daily sales report as an Excel buffer.
 * Extracted from /api/reports/daily-sales to allow direct invocation without self-fetch.
 */
export async function generateDailySalesReport(opts: {
  date?: string
}): Promise<DailySalesResult> {
  const supabase = await createClient()

  const targetDate = opts.date || new Date().toISOString().split("T")[0]
  const startOfDay = `${targetDate}T00:00:00Z`
  const endOfDay = `${targetDate}T23:59:59Z`

  console.log("[v0] Generando reporte de ventas para:", targetDate)

  const { data: accounts } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, access_token, nickname")

  if (!accounts || accounts.length === 0) {
    throw new Error("No hay cuentas ML configuradas")
  }

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

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet("Ventas")

  const headers = [
    "IVA", "CODIGO_PEDIDO", "", "", "", "", "", "CANTIDAD", "", "", "", "", "", "",
    "", "", "", "", "", "", "", "EAN", "", "", "", "PRECIO_VENTA", "", "", "", "",
    "", "", "CLIENTE_NOMBRE", "CLIENTE_IDENTIFICACION", "CLIENTE_DIRECCION",
    "CLIENTE_POBLACION", "CLIENTE_PROVINCIA", "CLIENTE_CODIGOPOSTAL", "CLIENTE_PAIS",
    "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
    "", "", "", "", "", "", "CLIENTE_DIRECCIONCOMPLETA"
  ]

  worksheet.addRow(headers)

  for (const order of allOrders) {
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
      let ean = item.item.seller_sku || item.item.seller_custom_field || ""

      if (!ean && item.item.id && accounts.length > 0) {
        try {
          const itemUrl = `https://api.mercadolibre.com/items/${item.item.id}`
          const itemResponse = await fetch(itemUrl, {
            headers: { Authorization: `Bearer ${accounts[0].access_token}` }
          })

          if (itemResponse.ok) {
            const itemData = await itemResponse.json()

            if (itemData.attributes) {
              const isbnAttr = itemData.attributes.find((attr: any) =>
                attr.id === 'ISBN' || attr.id === 'GTIN' || attr.id === 'EAN'
              )
              if (isbnAttr && isbnAttr.value_name) {
                ean = isbnAttr.value_name
              }
            }

            if (!ean && itemData.seller_custom_field) {
              ean = itemData.seller_custom_field
            }
          }
        } catch (error) {
          console.error(`[v0] Error fetching item ${item.item.id}:`, error)
        }
      }

      const receiver = shippingData.receiver_address || {}

      const buyerBilling = billingInfo.buyer?.billing_info || {}
      const billingAddress = buyerBilling.address || {}
      const identification = buyerBilling.identification || {}

      const finalName = buyerBilling.name && buyerBilling.last_name
        ? `${buyerBilling.name} ${buyerBilling.last_name}`.trim()
        : receiver.receiver_name || order.buyer?.nickname || ""
      const finalDocNumber = identification.number || ""
      const finalStreetName = billingAddress.street_name || receiver.street_name || ""
      const finalStreetNumber = billingAddress.street_number || receiver.street_number || ""
      const finalCity = billingAddress.city_name || receiver.city?.name || ""
      const finalState = billingAddress.state?.name || receiver.state?.name || ""
      const finalZipCode = billingAddress.zip_code || receiver.zip_code || ""

      const row = new Array(62).fill("")
      row[0] = 0
      row[1] = String(order.id)
      row[7] = item.quantity
      row[21] = ean
      row[25] = item.unit_price
      row[32] = finalName
      row[33] = finalDocNumber
      row[34] = finalStreetName ? `${finalStreetName} ${finalStreetNumber}`.trim() : ""
      row[35] = finalCity
      row[36] = finalState
      row[37] = finalZipCode
      row[38] = "AR"
      row[61] = `${finalStreetName} ${finalStreetNumber}, ${finalCity}, ${finalState}`.trim().replace(/^,\s*|,\s*$/g, '')

      worksheet.addRow(row)
    }
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

  return {
    success: true,
    buffer,
    orderCount: allOrders.length,
  }
}

/**
 * Sends a daily sales report via email using Resend.
 */
export async function sendDailySalesEmail(opts: {
  date?: string
  email_recipients: string[]
}): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    return { success: false, error: "RESEND_API_KEY no configurada" }
  }

  const report = await generateDailySalesReport({ date: opts.date })
  const targetDate = opts.date || new Date().toISOString().split("T")[0]
  const base64Excel = report.buffer.toString('base64')

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Reportes <onboarding@resend.dev>',
      to: opts.email_recipients,
      subject: `Reporte de Ventas - ${targetDate}`,
      html: `
        <h2>Reporte de Ventas Diarias</h2>
        <p>Adjunto encontrarás el reporte de ventas del día ${targetDate}</p>
        <p>Total de órdenes: ${report.orderCount}</p>
      `,
      attachments: [{
        filename: `ventas-${targetDate}.xlsx`,
        content: base64Excel
      }]
    })
  })

  if (!emailResponse.ok) {
    const errorData = await emailResponse.json()
    return { success: false, error: errorData.message || "Error enviando email" }
  }

  return { success: true }
}
