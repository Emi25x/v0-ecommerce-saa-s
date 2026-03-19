import { type NextRequest } from "next/server"
import { createClient } from "@/lib/db/server"
import { executeSyncOrdersBatch } from "@/domains/mercadolibre/sync/orders"
import { NextResponse } from "next/server"
import { startRun } from "@/lib/process-runs"
import { requireCron } from "@/lib/auth/require-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutos

const MAX_ORDERS_PER_ACCOUNT = 500
const PAGE_SIZE = 50

export async function GET(request: NextRequest) {
  const cronAuth = await requireCron(request)
  if (cronAuth.error) return cronAuth.response

  try {
    const supabase = await createClient()

    const { data: accounts, error: accountsError } = await supabase.from("ml_accounts").select("id, nickname")

    if (accountsError) {
      console.error("[sync-ml-orders] Error fetching ML accounts:", accountsError)
      return NextResponse.json({ error: accountsError.message }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: "No ML accounts found" })
    }

    const run = await startRun(supabase, "ml_sync_orders", "ML Sync Orders (cron)")
    const results = []
    let grandTotalSynced = 0,
      grandTotalErrors = 0

    for (const account of accounts) {
      let totalSynced = 0
      let offset = 0
      let hasMore = true
      let pages = 0
      const maxPages = Math.ceil(MAX_ORDERS_PER_ACCOUNT / PAGE_SIZE)

      console.log(`[sync-ml-orders] Syncing orders for account: ${account.nickname}`)

      try {
        while (hasMore && pages < maxPages) {
          // Llamada directa a la lógica (sin self-fetch)
          const syncResult = await executeSyncOrdersBatch(supabase, {
            account_id: account.id,
            offset,
            limit: PAGE_SIZE,
          })

          if (!syncResult.ok) {
            if (syncResult.rate_limited) {
              console.warn(`[sync-ml-orders] Rate limited for account ${account.nickname}, stopping`)
            } else {
              console.error(`[sync-ml-orders] Error for account ${account.nickname}:`, syncResult.error)
            }
            break
          }

          totalSynced += syncResult.synced ?? 0
          hasMore = syncResult.has_more ?? false
          offset = syncResult.offset ?? offset + PAGE_SIZE
          pages++

          console.log(
            `[sync-ml-orders] ${account.nickname} page ${pages}: synced=${syncResult.synced}, total=${syncResult.total}, has_more=${hasMore}`,
          )

          if (hasMore) await new Promise((r) => setTimeout(r, 300))
        }

        grandTotalSynced += totalSynced
        results.push({ account: account.nickname, synced: totalSynced, pages })
      } catch (error) {
        grandTotalErrors++
        console.error(`[sync-ml-orders] Error processing account ${account.nickname}:`, error)
        results.push({
          account: account.nickname,
          synced: totalSynced,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }

      await new Promise((r) => setTimeout(r, 500))
    }

    await run.complete({
      rows_processed: grandTotalSynced,
      rows_updated: grandTotalSynced,
      rows_failed: grandTotalErrors,
      log_json: { accounts_count: accounts.length, results },
    })

    return NextResponse.json({
      ok: true,
      processed: accounts.length,
      results,
    })
  } catch (error) {
    console.error("[sync-ml-orders] Error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
