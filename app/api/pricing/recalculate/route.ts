import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { calculatePrice, type PriceListConfig, type ProductInput } from "@/domains/pricing/engine"

export const dynamic    = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/pricing/recalculate
 * Body: { price_list_id }
 * Recalcula todos los productos para la lista y persiste en product_prices.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase      = await createClient()
    const { price_list_id } = await req.json()

    if (!price_list_id)
      return NextResponse.json({ ok: false, error: "price_list_id required" }, { status: 400 })

    // Load list — join warehouse to get base_currency
    const { data: listRow, error: listErr } = await supabase
      .from("price_lists")
      .select(`*, rules:price_list_rules(*), fee_rules:price_list_fee_rules(*), warehouse:warehouses(id,base_currency)`)
      .eq("id", price_list_id)
      .single()

    if (listErr || !listRow)
      return NextResponse.json({ ok: false, error: "price list not found" }, { status: 404 })

    const fromCurrency: string | null = listRow.warehouse?.base_currency ?? null
    const toCurrency:   string        = listRow.currency

    // Auto-resolve FX rate once for the entire batch
    let resolvedFxRate: number | null = null
    if (fromCurrency && fromCurrency !== toCurrency) {
      const { data: fxRow } = await supabase
        .from("exchange_rates")
        .select("rate")
        .eq("from_currency", fromCurrency)
        .eq("to_currency", toCurrency)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      resolvedFxRate = fxRow?.rate ?? null
    }

    const list: PriceListConfig = {
      id:               listRow.id,
      name:             listRow.name,
      pricing_base:     listRow.pricing_base,
      currency:         toCurrency,
      from_currency:    fromCurrency,
      resolved_fx_rate: resolvedFxRate,
      rules:            listRow.rules?.[0] ?? null,
      fee_rules:        listRow.fee_rules ?? [],
    }

    // Load all products with costs + pvp
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select(`id, pvp_editorial, costs:product_costs(*)`)

    if (prodErr) throw prodErr

    const now      = new Date().toISOString()
    const batch    = (products ?? []).map((p: any) => {
      const costRow = p.costs?.[0]
      const input: ProductInput = {
        product_id:           p.id,
        supplier_cost:        costRow?.supplier_cost ?? null,
        import_shipping_cost: costRow?.import_shipping_cost ?? list.rules?.default_import_shipping_cost ?? 0,
        pvp_editorial:        p.pvp_editorial ?? null,
      }
      const calc = calculatePrice(list, input)
      return {
        product_id:           p.id,
        price_list_id:        price_list_id,
        calculated_price:     calc.calculated_price,
        calculated_margin:    calc.calculated_margin,
        base_cost:            calc.total_cost,
        base_pvp:             calc.pvp_editorial,
        pricing_base_used:    calc.pricing_base_used,
        fx_used:              calc.fx_rate,
        commission_amount:    calc.commission_amount,
        fixed_fee_amount:     calc.fixed_fee_amount,
        shipping_cost_amount: calc.shipping_cost_amount,
        calculation_json:     calc,
        has_warnings:         calc.warnings.length > 0,
        margin_below_min:     calc.margin_below_min,
        updated_at:           now,
      }
    })

    // Upsert in chunks of 200
    let upserted = 0
    const CHUNK  = 200
    for (let i = 0; i < batch.length; i += CHUNK) {
      const chunk      = batch.slice(i, i + CHUNK)
      const { error }  = await supabase
        .from("product_prices")
        .upsert(chunk, { onConflict: "product_id,price_list_id" })
      if (error) throw error
      upserted += chunk.length
    }

    return NextResponse.json({ ok: true, upserted, total: batch.length })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
