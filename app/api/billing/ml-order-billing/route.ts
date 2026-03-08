import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getMlOrderBillingInfo } from "@/lib/arca/ml-billing"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const account_id = searchParams.get("account_id") || ""
    const order_id = searchParams.get("order_id") || ""
    const debug = searchParams.get("debug") === "1"

    const result = await getMlOrderBillingInfo(supabase, account_id, order_id, debug)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.message?.includes("no encontrada") ? 404 : 500 }
    )
  }
}
