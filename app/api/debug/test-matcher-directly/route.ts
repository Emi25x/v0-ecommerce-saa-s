import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient({ useServiceRole: true })

  // Debug: verificar qué hay en products vs ml_publications
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, ean, gtin, isbn, sku")
    .limit(3)

  const { data: pubs, error: pubErr } = await supabase
    .from("ml_publications")
    .select("id, ean, isbn, sku, gtin, product_id, matched_by")
    .limit(3)

  const { data: matched, error: matchErr } = await supabase
    .from("ml_publications")
    .select("id, ean, isbn, sku, product_id, matched_by")
    .not("product_id", "is", null)
    .limit(5)

  return NextResponse.json({
    products_sample: products,
    products_error: prodErr,
    pubs_sample: pubs,
    pubs_error: pubErr,
    matched_sample: matched,
    matched_error: matchErr,
  })
}
