import { createClient } from "@/lib/supabase/server"
import { executeSyncOrdersBatch } from "@/lib/ml/sync-orders-logic"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutos

const MAX_ORDERS_PER_ACCOUNT = 500
const PAGE_SIZE = 50

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      const isVercelCron = request.headers.get("x-vercel-cron") === "true"
      if (!isVercelCron && process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const supabase = await createClient()

    const { data: accounts, error: accountsError } = await supabase
      .from("ml_accounts")
      .select("id, nickname")

    if (accountsError) {
      console.error("[sync-ml-orders] Error fetching ML accounts:", accountsError)
      return NextResponse.json({ error: accountsError.message }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: "No ML accounts found" })
    }

    const results = []

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
          offset = syncResult.offset ?? (offset + PAGE_SIZE)
          pages++

          console.log(`[sync-ml-orders] ${account.nickname} page ${pages}: synced=${syncResult.synced}, total=${syncResult.total}, has_more=${hasMore}`)

          if (hasMore) await new Promise(r => setTimeout(r, 300))
        }

        results.push({ account: account.nickname, synced: totalSynced, pages })
      } catch (error) {
        console.error(`[sync-ml-orders] Error processing account ${account.nickname}:`, error)
        results.push({
          account: account.nickname,
          synced: totalSynced,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }

      await new Promise(r => setTimeout(r, 500))
    }

    return NextResponse.json({
      ok: true,
      processed: accounts.length,
      results,
    })

  } catch (error) {
    console.error("[sync-ml-orders] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
