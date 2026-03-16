import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// GET /api/ml/publications/duplicates?account_id=xxx
// Devuelve grupos de SKUs con 2+ publicaciones activas/pausadas.
// Excluye cerradas/inactivas (ya fueron eliminadas).
// También enriquece con datos de ML: sold_quantity y listing_type_id (para cuotas).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ ok: false, error: "account_id requerido" }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Trae publicaciones con SKU, excluyendo cerradas/inactivas
    const { data, error } = await supabase
      .from("ml_publications")
      .select(
        "id, ml_item_id, account_id, title, sku, ean, isbn, status, price, current_stock, catalog_listing, product_id, permalink, updated_at"
      )
      .eq("account_id", accountId)
      .not("sku", "is", null)
      .not("status", "in", '("closed","inactive")')
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

    // Detectar duplicados: cualquier SKU con 2+ publicaciones activas/pausadas.
    // Casos:
    //   2+ tradicionales         → duplicado claro
    //   2+ catálogo              → duplicado claro
    //   1 tradicional + 1 catálogo → también duplicado (solo debe quedar 1)
    const groups: Array<{ sku: string; traditional: (typeof data)[number][]; catalog: (typeof data)[number][] }> = []
    for (const [sku, pubs] of Object.entries(bySku)) {
      if ((pubs?.length ?? 0) < 2) continue
      const traditional = pubs!.filter(p => !p.catalog_listing)
      const catalog     = pubs!.filter(p =>  p.catalog_listing)
      groups.push({ sku, traditional, catalog })
    }

    groups.sort((a, b) => a.sku.localeCompare(b.sku))

    // ── Enriquecer con datos de ML: sold_quantity y listing_type_id ──────────
    // listing_type_id indica si tiene cuotas (gold_premium = cuotas sin interés).
    let mlStats: Record<string, { sold_quantity: number; listing_type_id: string | null }> = {}

    const { data: account } = await supabase
      .from("ml_accounts")
      .select("access_token")
      .eq("id", accountId)
      .single()

    if (account?.access_token && groups.length > 0) {
      const allItemIds = groups.flatMap(g =>
        [...g.traditional, ...g.catalog].map(p => p.ml_item_id)
      )

      // Multiget en chunks de 20 (límite real de ML API)
      for (let i = 0; i < allItemIds.length; i += 20) {
        const chunk = allItemIds.slice(i, i + 20)
        try {
          const res = await fetch(
            `https://api.mercadolibre.com/items?ids=${chunk.join(",")}&attributes=id,sold_quantity,listing_type_id`,
            { headers: { Authorization: `Bearer ${account.access_token}` } }
          )
          if (res.ok) {
            const items: Array<{ code: number; body: { id: string; sold_quantity?: number; listing_type_id?: string } }> = await res.json()
            for (const item of items) {
              if (item.code === 200 && item.body?.id) {
                mlStats[item.body.id] = {
                  sold_quantity:   item.body.sold_quantity   ?? 0,
                  listing_type_id: item.body.listing_type_id ?? null,
                }
              }
            }
          }
        } catch {
          // Si falla el enriquecimiento de ML, se devuelven los datos de DB igual
        }
      }
    }

    return NextResponse.json({ ok: true, groups, ml_stats: mlStats, total: groups.length })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
