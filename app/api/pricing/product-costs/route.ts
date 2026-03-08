import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const supabase    = await createClient()
    const { searchParams } = req.nextUrl
    const page  = parseInt(searchParams.get("page")  ?? "0", 10)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100)
    const q     = searchParams.get("q")?.trim()

    let query = supabase
      .from("product_costs")
      .select(`
        *,
        product:products(id, title, ean, sku, pvp_editorial)
      `, { count: "exact" })
      .range(page * limit, (page + 1) * limit - 1)
      .order("updated_at", { ascending: false })

    if (q) {
      // join-side filter via products
      query = query.or(`product.title.ilike.%${q}%,product.ean.ilike.%${q}%,product.sku.ilike.%${q}%`)
    }

    const { data, count, error } = await query
    if (error) throw error
    return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const body     = await req.json()
    const { product_id, best_supplier_id, supplier_cost, import_shipping_cost = 0, source_currency = "ARS" } = body

    if (!product_id)
      return NextResponse.json({ ok: false, error: "product_id required" }, { status: 400 })

    const { data, error } = await supabase
      .from("product_costs")
      .upsert({
        product_id,
        best_supplier_id: best_supplier_id ?? null,
        supplier_cost:    supplier_cost != null ? Number(supplier_cost) : null,
        import_shipping_cost: Number(import_shipping_cost),
        source_currency,
        updated_at: new Date().toISOString(),
      }, { onConflict: "product_id" })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, cost: data })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
