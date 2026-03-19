import { createAdminClient } from "@/lib/db/admin"
import { NextResponse } from "next/server"

/**
 * GET /api/ml/matcher/debug?account_id=xxx
 * Debug endpoint para verificar qué publicaciones ve el matcher
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get("account_id")

  if (!accountId) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Total publicaciones
  const { count: totalPubs } = await supabase
    .from("ml_publications")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId)

  // Publicaciones sin vincular
  const { count: unlinked } = await supabase
    .from("ml_publications")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId)
    .is("product_id", null)

  // Con identificadores
  const { data: samples } = await supabase
    .from("ml_publications")
    .select("id, title, isbn, ean, sku, product_id")
    .eq("account_id", accountId)
    .is("product_id", null)
    .limit(10)

  const candidates = samples?.filter((s) => s.isbn || s.ean || s.sku) || []

  return NextResponse.json({
    ok: true,
    account_id: accountId,
    total_publications: totalPubs || 0,
    unlinked: unlinked || 0,
    candidates_with_identifiers: candidates.length,
    sample_candidates: candidates.slice(0, 5).map((s) => ({
      id: s.id,
      title: s.title?.substring(0, 50),
      has_isbn: !!s.isbn,
      has_ean: !!s.ean,
      has_sku: !!s.sku,
      isbn: s.isbn,
      ean: s.ean,
      sku: s.sku,
    })),
  })
}
