import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  try {
    const { data: trackings, error } = await supabase
      .from("competition_tracking")
      .select(`
        *,
        products (title),
        ml_listings (ml_id, price)
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (error) throw error

    const formattedTrackings = trackings?.map((t: any) => ({
      id: t.id,
      product_id: t.product_id,
      ml_listing_id: t.ml_listing_id,
      search_query: t.search_query,
      is_active: t.is_active,
      product_title: t.products?.title,
      ml_id: t.ml_listings?.ml_id,
      current_price: t.ml_listings?.price,
    }))

    return NextResponse.json({ success: true, trackings: formattedTrackings })
  } catch (error: any) {
    console.error("Error fetching trackings:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { product_id, search_query } = await request.json()

    // Buscar el listing de ML asociado al producto
    const { data: listing } = await supabase.from("ml_listings").select("id").eq("product_id", product_id).single()

    if (!listing) {
      return NextResponse.json(
        { success: false, error: "No se encontró publicación de ML para este producto" },
        { status: 404 },
      )
    }

    const { data, error } = await supabase
      .from("competition_tracking")
      .insert({
        product_id,
        ml_listing_id: listing.id,
        search_query,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, tracking: data })
  } catch (error: any) {
    console.error("Error creating tracking:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
