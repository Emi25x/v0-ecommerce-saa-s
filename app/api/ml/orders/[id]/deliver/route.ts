import { type NextRequest, NextResponse } from "next/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { createClient } from "@/lib/db/server"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    console.log("[v0] Deliver endpoint - Starting for order:", id)

    let userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      console.log("[v0] Deliver endpoint - No ml_user_id in cookies, trying database")
      try {
        const supabase = await createClient()
        const { data: accounts, error: dbError } = await supabase
          .from("ml_accounts")
          .select("user_id")
          .eq("active", true)
          .limit(1)
          .single()

        if (dbError) {
          console.error("[v0] Deliver endpoint - Database error:", dbError)
          return NextResponse.json(
            {
              error: "Error al obtener cuenta activa",
              details: dbError.message,
              step: "database_query",
            },
            { status: 500 },
          )
        }

        if (accounts) {
          userId = accounts.user_id
          console.log("[v0] Deliver endpoint - Found userId from database:", userId)
        }
      } catch (dbException) {
        console.error("[v0] Deliver endpoint - Database exception:", dbException)
        return NextResponse.json(
          {
            error: "Excepción al acceder a la base de datos",
            details: dbException instanceof Error ? dbException.message : String(dbException),
            step: "database_connection",
          },
          { status: 500 },
        )
      }
    }

    if (!userId) {
      console.log("[v0] Deliver endpoint - No userId found")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    console.log("[v0] Deliver endpoint - userId:", userId)
    const orderId = id

    let accessToken
    try {
      accessToken = await getValidAccessToken(userId)
      console.log("[v0] Deliver endpoint - Got access token")
    } catch (tokenError) {
      console.error("[v0] Deliver endpoint - Error getting access token:", tokenError)
      return NextResponse.json(
        {
          error: "Error al obtener token de acceso",
          details: tokenError instanceof Error ? tokenError.message : String(tokenError),
          step: "get_access_token",
        },
        { status: 500 },
      )
    }

    console.log("[v0] Deliver endpoint - Fetching order from ML API")
    let orderResponse
    try {
      orderResponse = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    } catch (fetchError) {
      console.error("[v0] Deliver endpoint - Fetch error:", fetchError)
      return NextResponse.json(
        {
          error: "Error al conectar con MercadoLibre",
          details: fetchError instanceof Error ? fetchError.message : String(fetchError),
          step: "fetch_order",
        },
        { status: 500 },
      )
    }

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text()
      console.error("[v0] Deliver endpoint - Error fetching order:", orderResponse.status, errorText)
      return NextResponse.json(
        {
          error: `Error al obtener la orden: ${orderResponse.status}`,
          details: errorText,
          step: "ml_api_response",
        },
        { status: orderResponse.status },
      )
    }

    const order = await orderResponse.json()
    console.log("[v0] Deliver endpoint - Order data:", {
      orderId: order.id,
      status: order.status,
      tags: order.tags,
      shipping: order.shipping,
    })

    const orderTags = order.tags || []
    const hasNoShipping = orderTags.includes("no_shipping")
    let shipmentId = order.shipping?.id

    if (hasNoShipping && !shipmentId) {
      console.log("[v0] Deliver endpoint - Order has no_shipping, trying to get shipment from /orders/{id}/shipments")

      try {
        const shipmentsResponse = await fetch(`https://api.mercadolibre.com/orders/${orderId}/shipments`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (shipmentsResponse.ok) {
          const shipments = await shipmentsResponse.json()
          console.log("[v0] Deliver endpoint - Shipments response:", shipments)

          if (shipments && shipments.length > 0) {
            shipmentId = shipments[0].id
            console.log("[v0] Deliver endpoint - Found shipment_id:", shipmentId)
          }
        } else {
          console.log("[v0] Deliver endpoint - No shipments found for this order, status:", shipmentsResponse.status)
        }
      } catch (shipmentFetchError) {
        console.error("[v0] Deliver endpoint - Error fetching shipments:", shipmentFetchError)
      }
    }

    if (!shipmentId) {
      console.log("[v0] Deliver endpoint - No shipment ID found, cannot mark as delivered")
      return NextResponse.json(
        {
          error: "No se puede marcar como entregado manualmente",
          message:
            "Las órdenes de 'Acordar la entrega' (sin envío) no tienen un shipment_id asociado. " +
            "Según las políticas de MercadoLibre, estas órdenes se marcan automáticamente como entregadas " +
            "después de 28 días desde la fecha de compra.",
          suggestion: "Espera 28 días para que MercadoLibre la marque automáticamente como entregada.",
          orderData: {
            orderId: order.id,
            status: order.status,
            tags: orderTags,
            dateCreated: order.date_created,
            hasShipping: !!order.shipping,
            shippingData: order.shipping,
          },
          step: "no_shipment_id",
        },
        { status: 400 },
      )
    }

    const shippingMode = order.shipping?.shipping_mode || order.shipping?.mode
    const shippingStatus = order.shipping?.status
    const shippingSubstatus = order.shipping?.substatus

    console.log("[v0] Deliver endpoint - Order details:", {
      orderId: order.id,
      shipmentId,
      shippingMode,
      shippingStatus,
      shippingSubstatus,
      status: order.status,
      tags: orderTags,
      hasShipping: !!order.shipping,
    })

    if (shippingMode === "me2") {
      console.log("[v0] Deliver endpoint - ME2 shipment detected, cannot mark manually")
      return NextResponse.json(
        {
          error:
            "No se puede marcar como entregado manualmente. Los envíos ME2 (Mercado Envíos Full) se actualizan automáticamente cuando el transportista confirma la entrega.",
          shippingMode,
          step: "me2_validation",
        },
        { status: 400 },
      )
    }

    console.log("[v0] Deliver endpoint - Marking shipment as delivered using seller_notifications")

    let deliverResponse
    try {
      deliverResponse = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}/seller_notifications`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "delivered",
          substatus: null,
          payload: {
            comment: "Producto entregado al cliente",
            date: new Date().toISOString(),
          },
        }),
      })
    } catch (deliverFetchError) {
      console.error("[v0] Deliver endpoint - Fetch error on deliver:", deliverFetchError)
      return NextResponse.json(
        {
          error: "Error al conectar con MercadoLibre para marcar como entregado",
          details: deliverFetchError instanceof Error ? deliverFetchError.message : String(deliverFetchError),
          step: "fetch_deliver",
        },
        { status: 500 },
      )
    }

    const responseText = await deliverResponse.text()
    console.log("[v0] Deliver endpoint - ML API response status:", deliverResponse.status)
    console.log("[v0] Deliver endpoint - ML API response body:", responseText)

    if (!deliverResponse.ok) {
      let errorData
      try {
        errorData = JSON.parse(responseText)
      } catch {
        errorData = { message: responseText }
      }
      console.error("[v0] Deliver endpoint - Error response from ML:", errorData)
      return NextResponse.json(
        {
          error: errorData.message || `Error de MercadoLibre: ${deliverResponse.status}`,
          details: errorData,
          shippingMode,
          step: "ml_deliver_api",
        },
        { status: deliverResponse.status },
      )
    }

    const result = JSON.parse(responseText)
    console.log("[v0] Deliver endpoint - Success:", result)

    return NextResponse.json({
      success: true,
      shipmentId,
      result,
    })
  } catch (error) {
    console.error("[v0] Deliver endpoint - Unexpected error:", error)
    return NextResponse.json(
      {
        error: "Error inesperado en el servidor",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        step: "unexpected_exception",
      },
      { status: 500 },
    )
  }
}
