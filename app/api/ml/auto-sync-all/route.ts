import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { executeAutoSyncAccount } from "@/lib/ml/auto-sync-logic"

/**
 * POST /api/ml/auto-sync-all
 * Syncs all ML publications for a single account.
 * No longer self-recursive — uses direct loop in lib function.
 */
export async function POST(request: Request) {
  const supabase = createAdminClient()
  try {
    const { accountId } = await request.json()

    if (!accountId) {
      return NextResponse.json({ error: "accountId requerido" }, { status: 400 })
    }

    const result = await executeAutoSyncAccount(supabase, { accountId })

    return NextResponse.json({
      success: result.success,
      processed: result.processed,
      linked: result.linked,
      errors: result.errors,
      progress: 100,
      total: result.total,
      completed: true,
    })
  } catch (error) {
    console.error("[v0] Error fatal en auto-sync:", error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Error desconocido",
      fatal: true,
    }, { status: 500 })
  }
}
