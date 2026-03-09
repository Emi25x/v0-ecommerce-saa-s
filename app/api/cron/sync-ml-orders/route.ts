import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutos

const MAX_ORDERS_PER_ACCOUNT = 500
const PAGE_SIZE = 50 // ML orders/search max per page

export async function GET(request: Request) {
  try {
    // Verificar autorización
    const authHeader = request.headers.get("authorization")
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      const isVercelCron = request.headers.get("x-vercel-cron") === "true"
      if (!isVercelCron && process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const supabase = await createClient()

    // Obtener todas las cuentas ML
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
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_VERCEL_URL || "http://localhost:3000"

    for (const account of accounts) {
      let totalSynced = 0
      let offset = 0
      let hasMore = true
      let pages = 0
      const maxPages = Math.ceil(MAX_ORDERS_PER_ACCOUNT / PAGE_SIZE)

      console.log(`[sync-ml-orders] Syncing orders for account: ${account.nickname}`)

      try {
        while (hasMore && pages < maxPages) {
          const syncResponse = await fetch(`${baseUrl}/api/ml/sync-orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: account.id, offset, limit: PAGE_SIZE }),
          })

          if (!syncResponse.ok) {
            console.error(`[sync-ml-orders] HTTP ${syncResponse.status} for account ${account.nickname}`)
            break
          }

          const syncResult = await syncResponse.json()

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

          // Pequeña pausa entre páginas para no saturar ML
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

      // Delay entre cuentas para no saturar ML
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
