import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const { account_id } = await req.json().catch(() => ({}))
  if (!account_id) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("market_scan_jobs")
    .update({ status: "cancelled", ended_at: new Date().toISOString() })
    .eq("account_id", account_id)
    .in("status", ["running", "idle"])
    .select("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[MARKET-SCAN-CANCEL] account=${account_id} cancelled=${data?.length ?? 0} jobs`)
  return NextResponse.json({ ok: true, cancelled: data?.length ?? 0 })
}
