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
    // Contar publicaciones totales de esta cuenta
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

    // Contar publicaciones activas
    const { count: activePublications } = await supabase
      .from("ml_publications")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "active")

    return NextResponse.json({
      total_publications: totalPublications || 0,
      linked_publications: linkedPublications || 0,
      active_publications: activePublications || 0,
      unlinked_publications: (totalPublications || 0) - (linkedPublications || 0)
    })
  } catch (error) {
    console.error("Error fetching account stats:", error)
    return NextResponse.json({ error: "Error fetching stats" }, { status: 500 })
  }
}
