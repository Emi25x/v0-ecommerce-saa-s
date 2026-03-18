import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { getMerchantProducts } from "@/domains/marketing/google"

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const { data: conn } = await supabase
    .from("marketing_connections")
    .select("credentials")
    .eq("platform", "google_merchant")
    .eq("is_active", true)
    .single()

  if (!conn) return NextResponse.json({ error: "Google Merchant Center no conectado" }, { status: 404 })

  try {
    const data = await getMerchantProducts(conn.credentials)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
