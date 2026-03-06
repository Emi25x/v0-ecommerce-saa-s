import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase   = await createClient()
    const accountId  = request.nextUrl.searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ ok: false, error: "account_id requerido" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("ml_import_progress")
      .select("status, publications_scope, publications_offset, publications_total, updated_at")
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ ok: true, progress: data ?? null })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
