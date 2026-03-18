/**
 * GET /api/products/lookup?ean=<value>
 * Busca un producto por EAN o ISBN y devuelve sus campos principales.
 */
import { createClient } from "@/lib/db/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const ean = req.nextUrl.searchParams.get("ean")?.trim()
    if (!ean) return NextResponse.json({ ok: false, error: "ean requerido" }, { status: 400 })

    const supabase = await createClient()
    const { data: product } = await supabase
      .from("products")
      .select(`
        id, title, description, brand, category, author, sku, ean, isbn,
        price, canonical_weight_g, image_url, language, binding, pages,
        year_edition, ibic_subjects, subject, course, height, width,
        thickness, condition, custom_fields, ml_item_id
      `)
      .or(`ean.eq.${ean},isbn.eq.${ean}`)
      .limit(1)
      .maybeSingle()

    if (!product) return NextResponse.json({ ok: false, error: "No encontrado", product: null }, { status: 404 })
    return NextResponse.json({ ok: true, product })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
