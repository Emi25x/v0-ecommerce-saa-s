import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/ml/matcher/debug-match?account_id=xxx&limit=10
 *
 * Muestra exactamente qué tienen las publicaciones sin vincular en la DB,
 * qué tienen los productos, y por qué el matcher no hace match.
 * Solo para diagnóstico — no modifica nada.
 */
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id")
  const limit     = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "20"), 50)

  if (!accountId) return NextResponse.json({ error: "account_id required" }, { status: 400 })

  const supabase = createAdminClient()

  // ── 1) Sample de publicaciones sin vincular ────────────────────────────────
  const { data: pubs } = await supabase
    .from("ml_publications")
    .select("id, ml_item_id, title, ean, gtin, isbn, sku, product_id")
    .eq("account_id", accountId)
    .is("product_id", null)
    .limit(limit)

  // ── 2) Conteos reales ──────────────────────────────────────────────────────
  const [
    { count: totalUnlinked },
    { count: withEan },
    { count: withGtin },
    { count: withIsbn },
    { count: withSku },
    { count: withAny },
    { count: withNone },
  ] = await Promise.all([
    supabase.from("ml_publications").select("id", { count: "exact", head: true }).eq("account_id", accountId).is("product_id", null),
    supabase.from("ml_publications").select("id", { count: "exact", head: true }).eq("account_id", accountId).is("product_id", null).not("ean",  "is", null).neq("ean",  ""),
    supabase.from("ml_publications").select("id", { count: "exact", head: true }).eq("account_id", accountId).is("product_id", null).not("gtin", "is", null).neq("gtin", ""),
    supabase.from("ml_publications").select("id", { count: "exact", head: true }).eq("account_id", accountId).is("product_id", null).not("isbn", "is", null).neq("isbn", ""),
    supabase.from("ml_publications").select("id", { count: "exact", head: true }).eq("account_id", accountId).is("product_id", null).not("sku",  "is", null).neq("sku",  ""),
    supabase.from("ml_publications").select("id", { count: "exact", head: true }).eq("account_id", accountId).is("product_id", null).or("ean.not.is.null,gtin.not.is.null,isbn.not.is.null,sku.not.is.null"),
    supabase.from("ml_publications").select("id", { count: "exact", head: true }).eq("account_id", accountId).is("product_id", null).is("ean", null).is("gtin", null).is("isbn", null).is("sku", null),
  ])

  // ── 3) Sample de productos (primeros 5) ────────────────────────────────────
  const { data: sampleProducts } = await supabase
    .from("products")
    .select("id, sku, ean, isbn, gtin, title")
    .limit(5)

  // ── 4) Para cada pub sin vincular, intentar match manual ──────────────────
  // Cargar todos los productos para el índice
  const { data: allProducts } = await supabase
    .from("products")
    .select("id, ean, gtin, isbn, sku")

  function norm(s: string): string {
    return s.replace(/[\s\-\t\r\n]/g, "").toLowerCase().trim()
  }
  function addToIndex(idx: Map<string, string[]>, key: string, id: string) {
    if (!idx.has(key)) idx.set(key, [])
    idx.get(key)!.push(id)
  }

  const eanIndex  = new Map<string, string[]>()
  const isbnIndex = new Map<string, string[]>()
  const skuIndex  = new Map<string, string[]>()

  for (const p of allProducts ?? []) {
    for (const raw of [p.ean, p.gtin]) {
      if (raw) { const k = norm(raw); if (k) addToIndex(eanIndex, k, p.id) }
    }
    if (p.isbn) { const k = norm(p.isbn); if (k) addToIndex(isbnIndex, k, p.id) }
    if (p.sku)  { const k = norm(p.sku);  if (k) addToIndex(skuIndex, k, p.id) }
  }

  const pubDebug = (pubs ?? []).map(pub => {
    const eans:  string[] = []
    const isbns: string[] = []
    const skus:  string[] = []

    if (pub.ean)  { const k = norm(pub.ean);  if (k) eans.push(k) }
    if (pub.gtin) { const k = norm(pub.gtin); if (k) { if (!eans.includes(k)) eans.push(k) } }
    if (pub.isbn) {
      const k = norm(pub.isbn)
      if (k) {
        isbns.push(k)
        if (!eans.includes(k)) eans.push(k)  // ISBN-13 = EAN-13
      }
    }
    if (pub.sku) {
      const k = norm(pub.sku)
      if (k) {
        skus.push(k)
        if (/^\d{10,13}$/.test(k) && !eans.includes(k)) eans.push(k)  // numeric sku → try ean index
      }
    }

    let matchResult: any = null
    outer: for (const [ids, index, type] of [
      [eans,  eanIndex,  "ean"]  as const,
      [isbns, isbnIndex, "isbn"] as const,
      [skus,  skuIndex,  "sku"]  as const,
    ]) {
      for (const key of ids) {
        const pids = index.get(key) ?? []
        if (pids.length === 1) { matchResult = { found: true, type, key, product_id: pids[0] }; break outer }
        if (pids.length > 1)   { matchResult = { found: false, type, key, reason: "ambiguous", count: pids.length }; break outer }
      }
    }

    if (!matchResult) {
      matchResult = {
        found:  false,
        reason: eans.length + isbns.length + skus.length === 0 ? "no_identifiers" : "not_in_product_index",
        tried:  { eans, isbns, skus },
      }
    }

    return {
      ml_item_id: pub.ml_item_id,
      title:      (pub.title ?? "").slice(0, 60),
      db_fields:  { ean: pub.ean, gtin: pub.gtin, isbn: pub.isbn, sku: pub.sku },
      normalized: { eans, isbns, skus },
      match:      matchResult,
    }
  })

  return NextResponse.json({
    ok: true,
    account_id: accountId,
    counts: {
      total_unlinked:  totalUnlinked ?? 0,
      with_ean:        withEan  ?? 0,
      with_gtin:       withGtin ?? 0,
      with_isbn:       withIsbn ?? 0,
      with_sku:        withSku  ?? 0,
      with_any:        withAny  ?? 0,
      with_none:       withNone ?? 0,
    },
    product_index_sizes: {
      ean_index:  eanIndex.size,
      isbn_index: isbnIndex.size,
      sku_index:  skuIndex.size,
      total_products: allProducts?.length ?? 0,
    },
    sample_products: sampleProducts ?? [],
    publications_sample: pubDebug,
  })
}
