import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const account_id = searchParams.get("account_id")

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: progress } = await supabase
      .from("product_builder_progress")
      .select("*")
      .eq("account_id", account_id)
      .maybeSingle()

    return NextResponse.json(
      progress || {
        publications_processed: 0,
        publications_total: 0,
        products_created: 0,
        products_updated: 0,
        status: "idle",
      },
    )
  } catch (error: any) {
    console.error("[PRODUCT-BUILDER-STATS] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
