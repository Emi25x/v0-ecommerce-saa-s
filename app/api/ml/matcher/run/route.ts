import { createAdminClient } from "@/lib/db/admin"
import { NextResponse } from "next/server"
import { protectAPI } from "@/lib/auth/protect-api"
import { runMatcherBatch } from "@/domains/mercadolibre/matcher"

export const maxDuration = 60

/**
 * POST /api/ml/matcher/run
 * Matches ml_publications to products by EAN/ISBN/SKU.
 * Uses cursor-based pagination to avoid drift on shrinking datasets.
 */
export async function POST(request: Request) {
  const authCheck = await protectAPI()
  if (authCheck.error) return authCheck.response

  const body = await request.json()
  const { account_id: accountId, max_seconds = 12, batch_size = 200 } = body

  if (!accountId) {
    return NextResponse.json({ error: "missing_account_id" }, { status: 400 })
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(accountId)) {
    return NextResponse.json({ error: "invalid_account_id_format" }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    const result = await runMatcherBatch(supabase, createAdminClient(), {
      account_id: accountId,
      max_seconds,
      batch_size,
      reset: body.reset,
    })

    if (!result.ok) {
      if (result.status === "busy") {
        return NextResponse.json({ ok: false, message: "Another matcher is running" })
      }
      return NextResponse.json(result, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (err: any) {
    await supabase
      .from("ml_matcher_progress")
      .update({
        status: "failed",
        last_error: err.message,
      })
      .eq("account_id", accountId)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
