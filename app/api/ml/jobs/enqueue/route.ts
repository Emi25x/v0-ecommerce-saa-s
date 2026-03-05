import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { protectAPI } from "@/lib/auth/protect-api"

const VALID_TYPES = [
  "import_publications",
  "import_single_item",
  "build_products",
  "match_products",
  "catalog_optin",
  "buybox_sync",
  "price_update",
]

export async function POST(request: NextRequest) {
  const authError = await protectAPI(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { account_id, type, payload = {}, run_after } = body

    if (!account_id) {
      return NextResponse.json({ ok: false, error: "account_id requerido" }, { status: 400 })
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { ok: false, error: `type inválido. Valores permitidos: ${VALID_TYPES.join(", ")}` },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("ml_jobs")
      .insert({
        account_id,
        type,
        payload,
        status: "queued",
        run_after: run_after ?? new Date().toISOString(),
      })
      .select("id, account_id, type, status, run_after, created_at")
      .single()

    if (error) {
      console.error("[ml/jobs/enqueue] Supabase error:", error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, job: data })
  } catch (err: any) {
    console.error("[ml/jobs/enqueue] Error:", err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
