/**
 * @internal Diagnostic endpoint — ML publication queue stats (matched/unmatched counts).
 * Used by: app/(dashboard)/ml/importer/page.tsx
 * Protected by requireUser() — only authenticated users can access.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { requireUser } from "@/lib/auth/require-auth"

export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { count: totalPubs, error: totalError } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)

    if (totalError) {
      return NextResponse.json({ error: "Failed to count total", details: totalError.message }, { status: 500 })
    }

    const { count: matchedPubs } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .not("product_id", "is", null)

    const { count: unmatchedPubs } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("product_id", null)

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count: updatedLastHour } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .gte("updated_at", oneHourAgo)

    let recentCount = updatedLastHour || 0

    if (!updatedLastHour || updatedLastHour === 0) {
      const { count: createdLastHour } = await supabase
        .from("ml_publications")
        .select("*", { count: "exact", head: true })
        .eq("account_id", accountId)
        .gte("created_at", oneHourAgo)

      if (createdLastHour) {
        recentCount = createdLastHour
      }
    }

    return NextResponse.json({
      total_publications: totalPubs || 0,
      matched_publications: matchedPubs || 0,
      unmatched_publications: unmatchedPubs || 0,
      updated_last_hour: recentCount,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
