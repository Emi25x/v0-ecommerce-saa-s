import { type NextRequest, NextResponse } from "next/server"
import { getLibralOrders } from "@/domains/suppliers/libral/client"

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("libral_access_token")?.value

    if (!token) {
      return NextResponse.json({ error: "Not authenticated with Libral" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const estado = searchParams.get("estado") || undefined
    const fechaDesde = searchParams.get("fechaDesde") || undefined
    const fechaHasta = searchParams.get("fechaHasta") || undefined

    console.log("[v0] Libral Orders - Fetching with filters:", { estado, fechaDesde, fechaHasta })

    const orders = await getLibralOrders({ estado, fechaDesde, fechaHasta })

    console.log("[v0] Libral Orders - Retrieved:", orders.length, "orders")

    return NextResponse.json({ orders })
  } catch (error) {
    console.error("[v0] Libral orders error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to fetch Libral orders", details: errorMessage }, { status: 500 })
  }
}
