import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")
    const status = searchParams.get("status")
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    console.log("[v0] Fetching orders from DB - account:", accountId, "status:", status)

    // Construir query para leer de ml_orders
    let query = supabase.from("ml_orders").select("*", { count: "exact" })

    if (accountId) {
      query = query.eq("account_id", accountId)
    }

    if (status) {
      query = query.eq("status", status)
    }

    // Ordenar por fecha descendente y paginar
    const { data: orders, count, error } = await query
      .order("date_created", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("[v0] Error fetching orders from DB:", error)
      return NextResponse.json({
        orders: [],
        paging: { total: 0, limit, offset }
      })
    }

    console.log("[v0] Found", orders?.length || 0, "orders in DB")

    return NextResponse.json({
      orders: orders || [],
      paging: { total: count || 0, limit, offset }
    })
  } catch (error) {
    console.error("[v0] Error in orders endpoint:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
