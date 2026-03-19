import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

// Endpoint para procesar las notificaciones en cola
// Este endpoint se puede llamar desde un cron job o manualmente
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: notifications, error } = await supabase
      .from("ml_webhook_queue")
      .select("*")
      .eq("processed", false)
      .order("created_at", { ascending: true })
      .limit(50)

    if (error) {
      console.error("[v0] Error fetching webhook queue:", error)

      if (error.message?.includes("relation") || error.message?.includes("does not exist")) {
        return NextResponse.json(
          {
            error: "Las tablas de webhooks no existen. Ejecuta el script SQL create_webhook_tables.sql primero.",
            needsMigration: true,
          },
          { status: 500 },
        )
      }

      return NextResponse.json({ error: "Failed to fetch queue" }, { status: 500 })
    }

    if (!notifications || notifications.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No hay notificaciones pendientes",
        results: { processed: 0, failed: 0, errors: [] },
      })
    }

    console.log(`[v0] Processing ${notifications.length} webhook notifications`)

    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[],
    }

    // Procesar cada notificación
    for (const notification of notifications) {
      try {
        await processNotification(notification)

        // Marcar como procesada
        await supabase
          .from("ml_webhook_queue")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("id", notification.id)

        results.processed++
      } catch (error) {
        console.error(`[v0] Error processing notification ${notification.id}:`, error)
        results.failed++
        results.errors.push(`Notification ${notification.id}: ${error}`)
      }
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    console.error("[v0] Error processing webhook queue:", error)
    const errorMessage = error instanceof Error ? error.message : "Processing failed"
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

async function processNotification(notification: any) {
  const { topic, resource, user_id } = notification

  // Obtener token válido para el usuario
  const accessToken = await getValidAccessToken(user_id)
  if (!accessToken) {
    throw new Error(`No valid access token for user ${user_id}`)
  }

  // Hacer GET al resource para obtener los detalles completos
  const response = await fetch(`https://api.mercadolibre.com${resource}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch resource: ${response.status}`)
  }

  const data = await response.json()

  // Procesar según el topic
  switch (topic) {
    case "orders_v2":
      await processOrderUpdate(data, user_id)
      break
    case "shipments":
      await processShipmentUpdate(data, user_id)
      break
    case "items":
      await processItemUpdate(data, user_id)
      break
  }
}

async function processOrderUpdate(orderData: any, userId: string) {
  const supabase = await createClient()

  console.log(`[v0] Processing order update: ${orderData.id}`)

  // Guardar o actualizar la orden en la base de datos
  const { error } = await supabase.from("ml_orders").upsert(
    {
      order_id: orderData.id,
      user_id: userId,
      status: orderData.status,
      status_detail: orderData.status_detail,
      buyer_id: orderData.buyer?.id,
      buyer_nickname: orderData.buyer?.nickname,
      total_amount: orderData.total_amount,
      currency_id: orderData.currency_id,
      date_created: orderData.date_created,
      date_closed: orderData.date_closed,
      last_updated: orderData.last_updated,
      order_data: orderData,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "order_id,user_id" },
  )

  if (error) {
    console.error("[v0] Error upserting order:", error)
    throw error
  }

  // Registrar ventas en historial de stock cuando la orden es pagada/confirmada
  // Nota: el webhook `items` también disparará y registrará el cambio de stock real.
  // Esto registra la CAUSA (venta) con referencia a la orden.
  if (orderData.status === "paid" || orderData.status === "confirmed") {
    const items: any[] = orderData.order_items ?? []
    for (const line of items) {
      const mlItemId = line.item?.id
      const qtySold = line.quantity ?? 0
      if (!mlItemId || qtySold <= 0) continue

      const { data: pub } = await supabase
        .from("ml_publications")
        .select("current_stock, account_id")
        .eq("ml_item_id", mlItemId)
        .maybeSingle()

      if (!pub) continue

      const newQty = (pub.current_stock ?? 0) - qtySold

      await supabase.from("ml_stock_history").insert({
        ml_item_id: mlItemId,
        account_id: pub.account_id,
        old_quantity: pub.current_stock,
        new_quantity: Math.max(0, newQty),
        changed_by_user_id: null,
        source: "order_sold",
        notes: `Orden #${orderData.id} — ${qtySold} u. vendida${qtySold !== 1 ? "s" : ""}`,
      })
    }
  }

  console.log(`[v0] Order ${orderData.id} updated successfully`)
}

async function processShipmentUpdate(shipmentData: any, userId: string) {
  const supabase = await createClient()

  console.log(`[v0] Processing shipment update: ${shipmentData.id}`)

  // Guardar o actualizar el envío en la base de datos
  const { error } = await supabase.from("ml_shipments").upsert(
    {
      shipment_id: shipmentData.id,
      user_id: userId,
      order_id: shipmentData.order_id,
      status: shipmentData.status,
      substatus: shipmentData.substatus,
      tracking_number: shipmentData.tracking_number,
      tracking_method: shipmentData.tracking_method,
      date_created: shipmentData.date_created,
      last_updated: shipmentData.last_updated,
      shipment_data: shipmentData,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shipment_id,user_id" },
  )

  if (error) {
    console.error("[v0] Error upserting shipment:", error)
    throw error
  }

  console.log(`[v0] Shipment ${shipmentData.id} updated successfully`)
}

async function processItemUpdate(itemData: any, userId: string) {
  const supabase = await createClient()

  console.log(`[v0] Processing item update: ${itemData.id}`)

  const newQty: number | null = itemData.available_quantity ?? null

  // Obtener stock actual almacenado y account_id para comparar
  const { data: pub } = await supabase
    .from("ml_publications")
    .select("current_stock, account_id")
    .eq("ml_item_id", itemData.id)
    .maybeSingle()

  // Si el stock cambió, registrar en historial (cambio viene desde ML)
  if (pub && newQty !== null && newQty !== pub.current_stock) {
    await supabase.from("ml_stock_history").insert({
      ml_item_id: itemData.id,
      account_id: pub.account_id,
      old_quantity: pub.current_stock,
      new_quantity: newQty,
      changed_by_user_id: null, // no se conoce vía webhook
      source: "webhook_item_update",
      notes: `Estado ML: ${itemData.status ?? "?"}`,
    })

    // Actualizar stock en ml_publications
    await supabase
      .from("ml_publications")
      .update({
        current_stock: newQty,
        status: itemData.status ?? undefined,
        price: itemData.price ?? undefined,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("ml_item_id", itemData.id)
  }

  console.log(`[v0] Item ${itemData.id} processed (stock: ${pub?.current_stock} → ${newQty})`)
}
