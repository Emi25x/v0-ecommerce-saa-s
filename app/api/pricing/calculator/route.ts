import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { calculatePrice, type PriceListConfig, type ProductInput } from "@/lib/pricing/engine"

export const dynamic = "force-dynamic"

/**
 * POST /api/pricing/calculator
 * Body: { product_id, price_list_id }
 * OR:   { price_list_id, supplier_cost, import_shipping_cost, pvp_editorial }  (manual override)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const body     = await req.json()
    const { price_list_id } = body

    if (!price_list_id)
      return NextResponse.json({ ok: false, error: "price_list_id required" }, { status: 400 })

    // Load price list config
    const { data: listRow, error: listErr } = await supabase
      .from("price_lists")
      .select(`*, rules:price_list_rules(*), fee_rules:price_list_fee_rules(*)`)
      .eq("id", price_list_id)
      .single()

    if (listErr || !listRow)
      return NextResponse.json({ ok: false, error: "price list not found" }, { status: 404 })

    const list: PriceListConfig = {
      id:           listRow.id,
      name:         listRow.name,
      pricing_base: listRow.pricing_base,
      currency:     listRow.currency,
      rules:        listRow.rules?.[0] ?? null,
      fee_rules:    listRow.fee_rules ?? [],
    }

    // Resolve product inputs
    let product: ProductInput

    if (body.product_id) {
      // Load from DB
      const [{ data: prodRow }, { data: costRow }] = await Promise.all([
        supabase.from("products").select("id, pvp_editorial").eq("id", body.product_id).single(),
        supabase.from("product_costs").select("*").eq("product_id", body.product_id).single(),
      ])

      product = {
        product_id:           body.product_id,
        supplier_cost:        costRow?.supplier_cost ?? null,
        import_shipping_cost: costRow?.import_shipping_cost ?? list.rules?.default_import_shipping_cost ?? 0,
        pvp_editorial:        (prodRow as any)?.pvp_editorial ?? null,
      }
    } else {
      // Manual override
      product = {
        product_id:           "manual",
        supplier_cost:        body.supplier_cost != null ? Number(body.supplier_cost) : null,
        import_shipping_cost: Number(body.import_shipping_cost ?? 0),
        pvp_editorial:        body.pvp_editorial != null ? Number(body.pvp_editorial) : null,
      }
    }

    const result = calculatePrice(list, product)

    return NextResponse.json({ ok: true, result, list_name: list.name })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
