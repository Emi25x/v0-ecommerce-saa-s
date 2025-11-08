import { type NextRequest, NextResponse } from "next/server"
import { getValidAccessToken, getShipmentDetails } from "@/lib/mercadolibre"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(userId)
    const shipmentId = params.id

    console.log("[v0] ML Shipment Details - Fetching shipment:", shipmentId)

    const shipmentDetails = await getShipmentDetails(accessToken, shipmentId)

    return NextResponse.json(shipmentDetails)
  } catch (error) {
    console.error("[v0] ML Shipment Details - Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to fetch shipment details", details: errorMessage }, { status: 500 })
  }
}
