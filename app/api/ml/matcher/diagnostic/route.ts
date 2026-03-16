import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/ml/matcher/diagnostic?account_id=xxx
 * Diagnóstico completo del matcher: métricas de identificadores en publications y products.
 */
export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get("account_id")
    if (!accountId) return NextResponse.json({ ok: false, error: "missing_account_id" }, { status: 400 })

    const supabase = createAdminClient()

    // ── Progreso actual del matcher ─────────────────────────────────────────
    const { data: progress } = await supabase
      .from("ml_matcher_progress")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle()

    // ── Métricas de publicaciones ───────────────────────────────────────────
    const { count: totalPubs } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)

    const { count: withProductId } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .not("product_id", "is", null)

    const { count: pubsWithEan } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("product_id", null)
      .not("ean", "is", null)
      .neq("ean", "")

    const { count: pubsWithIsbn } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("product_id", null)
      .not("isbn", "is", null)
      .neq("isbn", "")

    const { count: pubsWithSku } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("product_id", null)
      .not("sku", "is", null)
      .neq("sku", "")

    const { count: pubsNoIdentifier } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("product_id", null)
      .is("ean", null)
      .is("isbn", null)
      .is("sku", null)

    // Muestras de publicaciones con identificadores
    const { data: samplePubsWithIds } = await supabase
      .from("ml_publications")
      .select("ml_item_id, title, ean, isbn, sku")
      .eq("account_id", accountId)
      .is("product_id", null)
      .or("ean.not.is.null,isbn.not.is.null,sku.not.is.null")
      .limit(5)

    // Muestras de publicaciones SIN identificadores
    const { data: samplePubsNoIds } = await supabase
      .from("ml_publications")
      .select("ml_item_id, title, ean, isbn, sku")
      .eq("account_id", accountId)
      .is("product_id", null)
      .is("ean", null)
      .is("isbn", null)
      .is("sku", null)
      .limit(5)

    // ── Métricas de products ────────────────────────────────────────────────
    const { count: totalProducts } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    const { count: productsWithEan } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .not("ean", "is", null)
      .neq("ean", "")

    const { count: productsWithIsbn } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .not("isbn", "is", null)
      .neq("isbn", "")

    const { count: productsWithSku } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .not("sku", "is", null)
      .neq("sku", "")

    // Muestras de productos con identificadores
    const { data: sampleProducts } = await supabase
      .from("products")
      .select("id, title, ean, isbn, sku")
      .or("ean.not.is.null,isbn.not.is.null,sku.not.is.null")
      .limit(5)

    const unlinkedPubs = (totalPubs ?? 0) - (withProductId ?? 0)
    const productsMissingIdentifiers =
      (totalProducts ?? 0) > 0 &&
      (productsWithEan ?? 0) + (productsWithIsbn ?? 0) + (productsWithSku ?? 0) < (totalProducts ?? 0) * 0.5

    return NextResponse.json({
      ok: true,
      account_id: accountId,
      generated_at: new Date().toISOString(),

      warnings: [
        ...(productsMissingIdentifiers
          ? ["products_missing_identifiers: Más del 50% de los productos no tienen EAN/ISBN/SKU — el match será bajo."]
          : []),
        ...(unlinkedPubs > 0 && (pubsWithEan ?? 0) + (pubsWithIsbn ?? 0) + (pubsWithSku ?? 0) === 0
          ? ["publications_no_identifiers: Ninguna publicación sin vincular tiene identificadores."]
          : []),
      ],

      progress: progress ?? null,

      publications: {
        total: totalPubs ?? 0,
        linked: withProductId ?? 0,
        unlinked: unlinkedPubs,
        unlinked_with_ean: pubsWithEan ?? 0,
        unlinked_with_isbn: pubsWithIsbn ?? 0,
        unlinked_with_sku: pubsWithSku ?? 0,
        unlinked_no_identifier: pubsNoIdentifier ?? 0,
        sample_with_identifiers: samplePubsWithIds ?? [],
        sample_without_identifiers: samplePubsNoIds ?? [],
      },

      products: {
        total: totalProducts ?? 0,
        with_ean: productsWithEan ?? 0,
        with_isbn: productsWithIsbn ?? 0,
        with_sku: productsWithSku ?? 0,
        missing_any_identifier: (totalProducts ?? 0) - Math.max(productsWithEan ?? 0, productsWithIsbn ?? 0, productsWithSku ?? 0),
        sample: sampleProducts ?? [],
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
