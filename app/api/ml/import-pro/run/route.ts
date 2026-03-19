import { createAdminClient } from "@/lib/db/admin"
import { NextRequest, NextResponse } from "next/server"
import { protectAPI } from "@/lib/auth/protect-api"
import { validateImportPreconditions, runProImport, handleImportError } from "@/domains/mercadolibre/import/pro-worker"

export const maxDuration = 60

/**
 * POST /api/ml/import-pro/run
 *
 * Body: {
 *   account_id: string
 *   max_seconds?:  number   default 12
 *   detail_batch?: number   default 50 (clamp 1..50)
 *   concurrency?:  number   default 2
 * }
 *
 * Response: {
 *   ok: boolean
 *   imported_count: number
 *   elapsed_ms: number
 *   has_more: boolean
 *   last_scroll_id: string | null
 *   errors_count: number
 *   rate_limited: boolean
 * }
 */
export async function POST(request: NextRequest) {
  const authCheck = await protectAPI()
  if (authCheck.error) return authCheck.response

  let accountId: string | null = null

  try {
    const body = await request.json()
    const { account_id } = body
    accountId = account_id

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = createAdminClient()

    // ── Validate preconditions (account exists, progress initialized, not running/paused)
    const validation = await validateImportPreconditions(supabase, accountId)
    if (!validation.ok) {
      return NextResponse.json(validation.body, { status: validation.status })
    }

    // ── Run the import loop
    const result = await runProImport(supabase, validation.account, validation.progress, {
      account_id: accountId,
      max_seconds: body.max_seconds,
      detail_batch: body.detail_batch,
      concurrency: body.concurrency,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    if (accountId) {
      const supabase = createAdminClient()
      await handleImportError(supabase, accountId, error, null)
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
