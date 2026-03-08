import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET /api/debug/matching-diagnostics?account_id=...
 * Diagnostica por qué no funciona el matching
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get("account_id")

  if (!accountId) {
    return NextResponse.json({ error: "missing account_id" }, { status: 400 })
  }

  const supabase = await createClient({ useServiceRole: true })

  try {
    // 1. Contar publicaciones sin vinculación
    const { count: unlinkedCount } = await supabase
      .from("ml_publications")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("product_id", null)

    // 2. Contar publicaciones con vinculación
    const { count: linkedCount } = await supabase
      .from("ml_publications")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .not("product_id", "is", null)

    // 3. Verificar si hay SKUs/EANs en las publicaciones
    const { data: pubsWithIdentifiers } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title, sku, ean, isbn, gtin")
      .eq("account_id", accountId)
      .or("sku.not.is.null,ean.not.is.null,isbn.not.is.null,gtin.not.is.null")
      .limit(5)

    // 4. Contar cuántos productos locales tienen identificadores
    const { count: productsWithIdentifiers } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .or("sku.not.is.null,ean.not.is.null,isbn.not.is.null,gtin.not.is.null")

    // 5. Verificar matcher progress
    const { data: matcherProgress } = await supabase
      .from("ml_matcher_progress")
      .select("*")
      .eq("account_id", accountId)
      .single()

    // 6. Leer algunos items de ML sin vincular para inspeccionar
    const { data: sampleUnlinked } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title, sku, ean, isbn, gtin, status, current_stock")
      .eq("account_id", accountId)
      .is("product_id", null)
      .limit(3)

    return NextResponse.json({
      diagnostics: {
        publications: {
          unlinked_count: unlinkedCount || 0,
          linked_count: linkedCount || 0,
          total: (unlinkedCount || 0) + (linkedCount || 0),
          link_rate: linkedCount ? (linkedCount / ((unlinkedCount || 0) + (linkedCount || 0)) * 100).toFixed(1) : "0",
        },
        publications_sample: pubsWithIdentifiers,
        products_with_identifiers: productsWithIdentifiers || 0,
        matcher_progress: matcherProgress ? {
          status: matcherProgress.status,
          processed_count: matcherProgress.processed_count,
          matched_count: matcherProgress.matched_count,
          not_found_count: matcherProgress.not_found_count,
          ambiguous_count: matcherProgress.ambiguous_count,
          total_target: matcherProgress.total_target,
        } : "No progress record",
        sample_unlinked: sampleUnlinked,
      },
      recommendation: !productsWithIdentifiers
        ? "❌ NO HAY PRODUCTOS CON SKU/EAN/ISBN/GTIN. Importa productos con identificadores primero."
        : !pubsWithIdentifiers?.length
        ? "❌ LOS ITEMS DE ML NO TIENEN SKU/EAN/ISBN/GTIN EXTRAÍDOS. Revisa la importación."
        : linkedCount === 0
        ? "⚠️  Matcher probablemente no se ejecutó. Intenta dispararlo manualmente: POST /api/ml/matcher/run"
        : "✅ System parece estar funcionando correctamente",
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
