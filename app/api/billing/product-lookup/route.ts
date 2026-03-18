import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const q = request.nextUrl.searchParams.get("q")?.trim()
    if (!q || q.length < 2) return NextResponse.json({ products: [] })

    const isNumeric = /^\d+$/.test(q)

    let query = supabase
      .from("products")
      .select("id, sku, ean, isbn, title, price")
      .limit(8)

    if (isNumeric) {
      // Búsqueda exacta por SKU, EAN o ISBN
      query = query.or(`sku.eq.${q},ean.eq.${q},isbn.eq.${q}`)
    } else {
      // Búsqueda por título parcial
      query = query.ilike("title", `%${q}%`)
    }

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ products: data || [] })
  } catch (e) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
