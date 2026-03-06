import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { calculatePrice, type PriceListConfig, type ProductInput } from "@/lib/pricing/engine"

export const dynamic = "force-dynamic"

/**
 * POST /api/pricing/calculator
 * Body: { list_id | price_list_id, supplier_cost?, import_shipping_cost?, pvp_editorial? }
 * OR:   { list_id | price_list_id, product_id }  (load from DB)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const body     = await req.json()

    // Accept both key names for backwards compat
    const listId = body.list_id ?? body.price_list_id
    if (!listId)
      return NextResponse.json({ ok: false, error: "list_id required" }, { status: 400 })

    // Load price list config including ml_rules
    const { data: listRow, error: listErr } = await supabase
      .from("price_lists")
      .select(`*, rules:price_list_rules(*), fee_rules:price_list_fee_rules(*), ml_rules:price_list_ml_rules(*)`)
      .eq("id", listId)
      .single()

    if (listErr || !listRow)
      return NextResponse.json({ ok: false, error: "price list not found" }, { status: 404 })

    const list: PriceListConfig = {
      id:           listRow.id,
      name:         listRow.name,
      pricing_base: listRow.pricing_base,
      currency:     listRow.currency,
      warehouse_id: listRow.warehouse_id ?? null,
      rules:        listRow.rules?.[0] ?? null,
      fee_rules:    (listRow.fee_rules ?? []).map((r: any) => ({
        ...r,
        extra_cost_amount:   r.extra_cost_amount   ?? null,
        extra_cost_currency: r.extra_cost_currency ?? null,
        extra_cost_label:    r.extra_cost_label    ?? null,
      })),
      ml_rules: listRow.ml_rules?.[0] ?? null,
    }

    // Resolve product inputs
    let product: ProductInput

    if (body.product_id) {
      const [{ data: prodRow }, { data: costRow }] = await Promise.all([
        supabase.from("products").select("id, pvp_editorial").eq("id", body.product_id).single(),
        supabase.from("product_costs").select("*").eq("product_id", body.product_id).single(),
      ])

      product = {
        product_id:           body.product_id,
        supplier_cost:        (costRow as any)?.supplier_cost        ?? null,
        import_shipping_cost: (costRow as any)?.import_shipping_cost ?? list.rules?.default_import_shipping_cost ?? 0,
        pvp_editorial:        (prodRow as any)?.pvp_editorial        ?? null,
        cost_currency:        (costRow as any)?.cost_currency        ?? null,
      }
    } else {
      product = {
        product_id:           "manual",
        supplier_cost:        body.supplier_cost        != null ? Number(body.supplier_cost)        : null,
        import_shipping_cost: body.import_shipping_cost != null ? Number(body.import_shipping_cost) : 0,
        pvp_editorial:        body.pvp_editorial        != null ? Number(body.pvp_editorial)        : null,
        cost_currency:        body.cost_currency        ?? null,
      }
    }

    const result = calculatePrice(list, product)

    return NextResponse.json({ ok: true, result, list_name: list.name })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
