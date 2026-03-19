import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const orderId = id
    const { item_id } = await request.json()

    console.log(`[v0] Marking item ${item_id} from order ${orderId} as received`)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: accounts } = await supabase.from("ml_accounts").select("*").eq("user_id", user.id)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: "No ML accounts found" }, { status: 404 })
    }

    let success = false
    let errorDetails = null

    for (const account of accounts) {
      try {
        const shipmentsResponse = await fetch(`https://api.mercadolibre.com/orders/${orderId}/shipments`, {
          headers: {
            Authorization: `Bearer ${account.access_token}`,
          },
        })

        if (!shipmentsResponse.ok) continue

        const shipmentsData = await shipmentsResponse.json()

        if (shipmentsData && shipmentsData.length > 0) {
          const shipmentId = shipmentsData[0].id

          const updateResponse = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}/handling`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: "handling_ready",
            }),
          })

          if (updateResponse.ok) {
            success = true
            console.log(`[v0] Successfully marked shipment ${shipmentId} as handling ready`)
            break
          } else {
            const error = await updateResponse.json()
            errorDetails = error
            console.error(`[v0] Error updating shipment handling:`, error)
          }
        }
      } catch (error) {
        console.error(`[v0] Error processing account ${account.id}:`, error)
        continue
      }
    }

    if (success) {
      return NextResponse.json({
        success: true,
        message: "Producto marcado como listo. La etiqueta estará disponible en breve.",
      })
    } else {
      return NextResponse.json(
        {
          error: "Failed to mark product as ready",
          details: errorDetails || "No se pudo actualizar el estado del envío",
        },
        { status: 400 },
      )
    }
  } catch (error) {
    console.error("[v0] Error in mark-received endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
