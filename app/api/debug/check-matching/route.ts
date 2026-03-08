import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const account_id = searchParams.get("account_id")

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = await createClient()

    // 1. Obtener progress
    const { data: progress } = await supabase
      .from("ml_import_progress")
      .select("*")
      .eq("account_id", account_id)
      .single()

    // 2. Contar ML publications
    const { count: ml_pubs_total } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)

    // 3. Contar products locales
    const { count: products_total } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)

    // 4. Contar ML publications CON product_id (vinculadas)
    const { count: ml_pubs_matched } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)
      .not("product_id", "is", null)

    // 5. Sample de ML publications SIN product_id
    const { data: sample_unmatched } = await supabase
      .from("ml_publications")
      .select("item_id, title, sku, ean, isbn, gtin")
      .eq("account_id", account_id)
      .is("product_id", null)
      .limit(3)

    // 6. Sample de ML publications CON product_id
    const { data: sample_matched } = await supabase
      .from("ml_publications")
      .select("item_id, title, sku, ean, isbn, gtin, product_id")
      .eq("account_id", account_id)
      .not("product_id", "is", null)
      .limit(3)

    // 7. Sample de products locales con sus códigos
    const { data: sample_products } = await supabase
      .from("products")
      .select("id, name, sku, isbn, ean, gtin")
      .eq("account_id", account_id)
      .limit(3)

    return NextResponse.json({
      account_id,
      progress_status: progress?.status,
      publications_total_from_progress: progress?.publications_total,
      ml_publications_count: ml_pubs_total,
      products_local_count: products_total,
      ml_publications_matched: ml_pubs_matched,
      ml_publications_unmatched: (ml_pubs_total || 0) - (ml_pubs_matched || 0),
      sample_unmatched,
      sample_matched,
      sample_products,
      diagnosis: {
        has_ml_pubs: (ml_pubs_total || 0) > 0,
        has_local_products: (products_total || 0) > 0,
        matching_rate: ml_pubs_total ? ((ml_pubs_matched || 0) / ml_pubs_total * 100).toFixed(1) + "%" : "0%",
        issue: (ml_pubs_total || 0) === 0 
          ? "NO publications imported from ML"
          : (products_total || 0) === 0
          ? "NO local products - cannot match"
          : (ml_pubs_matched || 0) === 0
          ? "Publications exist but NO matches - check SKU/EAN/ISBN/GTIN fields"
          : "OK - matching is working"
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
