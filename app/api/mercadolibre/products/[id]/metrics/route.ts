import { type NextRequest, NextResponse } from "next/server"
import { getValidAccessToken, getProductMetrics, getProductHealth } from "@/lib/mercadolibre"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(userId)
    const productId = id

    // Get metrics and health in parallel
    const [metrics, health] = await Promise.all([
      getProductMetrics(accessToken, productId).catch(() => null),
      getProductHealth(accessToken, productId).catch(() => null),
    ])

    return NextResponse.json({
      metrics,
      health,
    })
  } catch (error) {
    console.error("[v0] Product metrics error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to fetch metrics", details: errorMessage }, { status: 500 })
  }
}
