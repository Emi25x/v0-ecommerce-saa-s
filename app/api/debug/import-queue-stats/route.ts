import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    console.log(`[DEBUG-QUEUE-STATS] Checking queue stats for account: ${accountId}`)

    // Service role para bypassear RLS
    const supabaseUrl = process.env.SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Total publications
    const { count: totalPubs, error: totalError } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("ml_account_id", accountId)

    if (totalError) {
      console.error(`[DEBUG-QUEUE-STATS] Error counting total:`, totalError)
      return NextResponse.json({ error: "Failed to count total" }, { status: 500 })
    }

    // Matched publications (product_id NOT NULL)
    const { count: matchedPubs, error: matchedError } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("ml_account_id", accountId)
      .not("product_id", "is", null)

    if (matchedError) {
      console.error(`[DEBUG-QUEUE-STATS] Error counting matched:`, matchedError)
      return NextResponse.json({ error: "Failed to count matched" }, { status: 500 })
    }

    // Unmatched publications (product_id IS NULL)
    const { count: unmatchedPubs, error: unmatchedError } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("ml_account_id", accountId)
      .is("product_id", null)

    if (unmatchedError) {
      console.error(`[DEBUG-QUEUE-STATS] Error counting unmatched:`, unmatchedError)
      return NextResponse.json({ error: "Failed to count unmatched" }, { status: 500 })
    }

    // Updated last hour (usar updated_at si existe, sino created_at)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    
    const { count: updatedLastHour, error: updatedError } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("ml_account_id", accountId)
      .or(`updated_at.gte.${oneHourAgo},created_at.gte.${oneHourAgo}`)

    if (updatedError) {
      console.error(`[DEBUG-QUEUE-STATS] Error counting updated last hour:`, updatedError)
    }

    const stats = {
      total_publications: totalPubs || 0,
      matched_publications: matchedPubs || 0,
      unmatched_publications: unmatchedPubs || 0,
      updated_last_hour: updatedLastHour || 0,
    }

    console.log(`[DEBUG-QUEUE-STATS] Stats:`, stats)

    return NextResponse.json(stats)
  } catch (error: any) {
    console.error(`[DEBUG-QUEUE-STATS] Unexpected error:`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
