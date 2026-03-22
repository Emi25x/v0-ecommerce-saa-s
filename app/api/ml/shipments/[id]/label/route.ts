import { type NextRequest, NextResponse } from "next/server"
import { getValidAccessToken, getShippingLabel } from "@/lib/mercadolibre"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(userId)
    const shipmentId = id

    console.log("[v0] ML Shipping Label - Fetching label for shipment:", shipmentId)

    const labelData = await getShippingLabel(accessToken, shipmentId)

    return NextResponse.json(labelData)
  } catch (error) {
    console.error("[v0] ML Shipping Label - Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to fetch shipping label", details: errorMessage }, { status: 500 })
  }
}
