import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const ml_id = searchParams.get("ml_id") || searchParams.get("ml_listing_id")

    const supabase = await createClient()

    if (ml_id) {
      const { data, error } = await supabase.from("price_tracking").select("*").eq("ml_id", ml_id).maybeSingle()

      if (error) {
        console.log("[v0] Error fetching price tracking:", error.message)
        return NextResponse.json({ success: true, tracking: null })
      }

      return NextResponse.json({ success: true, tracking: data })
    } else {
      const { data, error } = await supabase.from("price_tracking").select("*").eq("enabled", true)

      if (error) {
        console.log("[v0] Error fetching price trackings:", error.message)
        return NextResponse.json({ success: true, trackings: [] })
      }

      return NextResponse.json({ success: true, trackings: data })
    }
  } catch (error: any) {
    console.error("[v0] Error in price tracking GET:", error)
    return NextResponse.json({ success: true, tracking: null, trackings: [] })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const ml_id = body.ml_id || body.ml_listing_id
    const { enabled, min_price } = body

    console.log("[v0] Received tracking request:", { ml_id, enabled, min_price })

    if (!ml_id || min_price === undefined || min_price === null || min_price === "") {
      console.log("[v0] Validation failed - missing required fields")
      return NextResponse.json({ success: false, error: "ml_id y min_price son requeridos" }, { status: 400 })
    }

    const minPriceNum = Number.parseFloat(min_price)
    if (isNaN(minPriceNum) || minPriceNum <= 0) {
      return NextResponse.json(
        { success: false, error: "min_price debe ser un número válido mayor a 0" },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    const { data: existing } = await supabase.from("price_tracking").select("*").eq("ml_id", ml_id).maybeSingle()

    if (existing) {
      console.log("[v0] Updating existing tracking for:", ml_id)
      const { data, error } = await supabase
        .from("price_tracking")
        .update({
          enabled,
          min_price: minPriceNum,
          updated_at: new Date().toISOString(),
        })
        .eq("ml_id", ml_id)
        .select()
        .single()

      if (error) {
        console.error("[v0] Error updating price tracking:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }

      console.log("[v0] Successfully updated tracking")
      return NextResponse.json({ success: true, tracking: data })
    } else {
      console.log("[v0] Creating new tracking for:", ml_id)
      const { data, error } = await supabase
        .from("price_tracking")
        .insert({
          ml_id,
          enabled,
          min_price: minPriceNum,
        })
        .select()
        .single()

      if (error) {
        console.error("[v0] Error creating price tracking:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }

      console.log("[v0] Successfully created tracking")
      return NextResponse.json({ success: true, tracking: data })
    }
  } catch (error: any) {
    console.error("[v0] Error in price tracking POST:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
