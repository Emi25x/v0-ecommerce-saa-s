import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const account_id = searchParams.get("account_id") || "956673a3-f4ad-4b6c-a38e-b7df3229220d"

  const { count: totalCount } = await supabase
    .from("ml_publications")
    .select("*", { count: "exact", head: true })
    .eq("account_id", account_id)

  const { count: withProductId } = await supabase
    .from("ml_publications")
    .select("*", { count: "exact", head: true })
    .eq("account_id", account_id)
    .not("product_id", "is", null)

  const { count: withoutProductId } = await supabase
    .from("ml_publications")
    .select("*", { count: "exact", head: true })
    .eq("account_id", account_id)
    .is("product_id", null)

  return NextResponse.json({
    total: totalCount,
    with_product_id: withProductId,
    without_product_id: withoutProductId,
    status: totalCount === 0 ? "TODAS BORRADAS - NECESITA RE-IMPORTAR" : "OK - LAS PUBIS ESTAN EN LA BD",
  })
}
