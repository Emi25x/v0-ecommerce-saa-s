import { type NextRequest, NextResponse } from "next/server"
import { getValidAccessToken, getOrderDetails } from "@/lib/mercadolibre"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(userId)
    const orderId = id

    console.log("[v0] ML Order Details - Fetching order:", orderId)

    const orderDetails = await getOrderDetails(accessToken, orderId)

    return NextResponse.json(orderDetails)
  } catch (error) {
    console.error("[v0] ML Order Details - Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to fetch order details", details: errorMessage }, { status: 500 })
  }
}
