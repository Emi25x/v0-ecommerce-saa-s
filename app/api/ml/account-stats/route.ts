import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get("account_id")

  if (!accountId) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  try {
    // Obtener cuenta para consultar ML
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("ml_user_id, access_token")
      .eq("id", accountId)
      .single()

    // Obtener total de publicaciones activas en ML
    let totalInML = 0
    if (account?.access_token && account?.ml_user_id) {
      try {
        const mlResponse = await fetch(
          `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active&limit=1`,
          { headers: { Authorization: `Bearer ${account.access_token}` } }
        )
        if (mlResponse.ok) {
          const mlData = await mlResponse.json()
          totalInML = mlData.paging?.total || 0
        }
      } catch (e) {
        console.error("Error fetching ML total:", e)
      }
    }

    // Contar publicaciones totales de esta cuenta en nuestra DB
    const { count: totalPublications } = await supabase
      .from("ml_publications")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)

    // Contar publicaciones vinculadas (con product_id)
    const { count: linkedPublications } = await supabase
      .from("ml_publications")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .not("product_id", "is", null)

    // Contar publicaciones activas en nuestra DB
    const { count: activePublications } = await supabase
      .from("ml_publications")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "active")

    return NextResponse.json({
      total_in_ml: totalInML,
      total_publications: totalPublications || 0,
      linked_publications: linkedPublications || 0,
      active_publications: activePublications || 0,
      unlinked_publications: (totalPublications || 0) - (linkedPublications || 0),
      pending_import: totalInML - (totalPublications || 0)
    })
  } catch (error) {
    console.error("Error fetching account stats:", error)
    return NextResponse.json({ error: "Error fetching stats" }, { status: 500 })
  }
}
