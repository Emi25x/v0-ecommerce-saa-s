import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { Request } from "next/dist/server/web/types"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    // Get last visit times from localStorage (will be passed as query params)
    const url = new URL(request.url)
    const lastVisitOrders = url.searchParams.get("lastVisitOrders")
    const lastVisitProducts = url.searchParams.get("lastVisitProducts")
    const lastVisitShipments = url.searchParams.get("lastVisitShipments")

    // Count new orders since last visit
    let newOrdersCount = 0
    if (lastVisitOrders) {
      try {
        const { count, error } = await supabase
          .from("ml_orders")
          .select("*", { count: "exact", head: true })
          .gte("date_created", lastVisitOrders)

        if (error) {
          if (error.message.includes("relation") || error.message.includes("does not exist")) {
            console.log("[v0] ml_orders table does not exist yet - skipping")
          } else {
            console.log("[v0] ml_orders query error:", error.message)
          }
        } else {
          newOrdersCount = count || 0
        }
      } catch (error) {
        console.log("[v0] ml_orders error (caught):", error instanceof Error ? error.message : error)
      }
    }

    // Count new products since last visit
    let newProductsCount = 0
    if (lastVisitProducts) {
      try {
        const { count, error } = await supabase
          .from("ml_listings")
          .select("*", { count: "exact", head: true })
          .gte("created_at", lastVisitProducts)

        if (error) {
          if (error.message.includes("relation") || error.message.includes("does not exist")) {
            console.log("[v0] ml_listings table does not exist yet - skipping")
          } else {
            console.log("[v0] ml_listings query error:", error.message)
          }
        } else {
          newProductsCount = count || 0
        }
      } catch (error) {
        console.log("[v0] ml_listings error (caught):", error instanceof Error ? error.message : error)
      }
    }

    // Count ready to ship orders
    let readyToShipCountValue = 0
    try {
      const { count: readyToShipCount, error } = await supabase
        .from("ml_shipments")
        .select("*", { count: "exact", head: true })
        .eq("status", "ready_to_ship")

      if (error) {
        if (error.message.includes("relation") || error.message.includes("does not exist")) {
          console.log("[v0] ml_shipments table does not exist yet - skipping")
        } else {
          console.log("[v0] ml_shipments query error:", error.message)
        }
      } else {
        readyToShipCountValue = readyToShipCount || 0
      }
    } catch (error) {
      console.log("[v0] ml_shipments error (caught):", error instanceof Error ? error.message : error)
    }

    return NextResponse.json({
      orders: newOrdersCount,
      products: newProductsCount,
      shipments: readyToShipCountValue,
    })
  } catch (error) {
    console.error("[v0] Error fetching notifications:", error)
    return NextResponse.json({ orders: 0, products: 0, shipments: 0 })
  }
}
