import { type NextRequest, NextResponse } from "next/server"
import { sendLibralOrder, type LibralOrder } from "@/lib/libral"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("libral_access_token")?.value

    if (!token) {
      return NextResponse.json({ error: "Not authenticated with Libral" }, { status: 401 })
    }

    const order: LibralOrder = await request.json()

    if (!order.items || order.items.length === 0) {
      return NextResponse.json({ error: "Order must have at least one item" }, { status: 400 })
    }

    console.log("[v0] Libral Order Send - Items:", order.items.length)

    // Send order to Libral as "documento de entrada"
    const result = await sendLibralOrder(token, order)

    // Log the order in database
    const supabase = await createClient()

    await supabase.from("libral_orders").insert({
      order_data: order,
      libral_response: result,
      status: "sent",
    })

    console.log("[v0] Libral Order Send - Success")

    return NextResponse.json({
      success: true,
      message: "Order sent to Libral successfully",
      result,
    })
  } catch (error) {
    console.error("[v0] Libral order send error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to send order to Libral", details: errorMessage }, { status: 500 })
  }
}
