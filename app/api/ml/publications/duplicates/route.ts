import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/ml/publications/duplicates?account_id=xxx
// Devuelve grupos de SKUs donde hay más de 1 publicación tradicional O más de 1 de catálogo.
// Un par (1 tradicional + 1 catálogo) es lo esperado. El duplicado aparece cuando hay 2+ del mismo tipo.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ ok: false, error: "account_id requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    // Trae todas las publicaciones con SKU para esta cuenta
    const { data, error } = await supabase
      .from("ml_publications")
      .select(
        "id, ml_item_id, account_id, title, sku, ean, isbn, status, price, current_stock, catalog_listing, product_id, permalink, updated_at"
      )
      .eq("account_id", accountId)
      .not("sku", "is", null)
      .order("current_stock", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false, nullsFirst: false })

    if (error) throw error

    // Agrupar por SKU
    const bySku: Record<string, typeof data> = {}
    for (const pub of data ?? []) {
      if (!pub.sku) continue
      if (!bySku[pub.sku]) bySku[pub.sku] = []
      bySku[pub.sku].push(pub)
    }

    // Detectar duplicados: cualquier SKU con 2+ publicaciones es un duplicado.
    // Casos:
    //   2+ tradicionales → duplicado claro
    //   2+ catálogo      → duplicado claro
    //   1 tradicional + 1 catálogo → también duplicado (solo debe quedar 1)
    const groups = []
    for (const [sku, pubs] of Object.entries(bySku)) {
      if ((pubs?.length ?? 0) < 2) continue
      const traditional = pubs!.filter(p => !p.catalog_listing)
      const catalog     = pubs!.filter(p =>  p.catalog_listing)
      groups.push({ sku, traditional, catalog })
    }

    // Ordenar por SKU
    groups.sort((a, b) => a.sku.localeCompare(b.sku))

    return NextResponse.json({ ok: true, groups, total: groups.length })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
