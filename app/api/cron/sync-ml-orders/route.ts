import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutos

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
      console.error("[v0] Error fetching ML accounts:", accountsError)
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
      try {
        console.log(`[v0] Syncing orders for account: ${account.nickname}`)
        
        const syncResponse = await fetch(`${baseUrl}/api/ml/sync-orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: account.id })
        })

        const syncResult = await syncResponse.json()

        results.push({
          account: account.nickname,
          success: syncResult.success,
          synced: syncResult.synced,
          errors: syncResult.errors
        })

        console.log(`[v0] Account ${account.nickname}: synced=${syncResult.synced}, errors=${syncResult.errors}`)
      } catch (error) {
        console.error(`[v0] Error processing account ${account.nickname}:`, error)
        results.push({
          account: account.nickname,
          error: error instanceof Error ? error.message : "Unknown error"
        })
      }

      // Delay entre cuentas para no saturar ML
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    return NextResponse.json({
      success: true,
      processed: accounts.length,
      results
    })

  } catch (error) {
    console.error("[v0] Error in sync-ml-orders cron:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
