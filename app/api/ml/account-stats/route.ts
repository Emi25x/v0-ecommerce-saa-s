import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get("account_id")

  if (!accountId) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  try {
    // Obtener el total de ML guardado en la cuenta (cache)
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("total_ml_publications")
      .eq("id", accountId)
      .single()

    const totalInML = account?.total_ml_publications || 0

    // Contar publicaciones totales de esta cuenta en nuestra DB
    const { count: totalPublications, error: countError } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)

    if (countError) {
      console.error("[v0] Error counting total publications:", countError)
    }

    // Contar publicaciones vinculadas (con product_id)
    const { count: linkedPublications, error: linkedError } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .not("product_id", "is", null)

    if (linkedError) {
      console.error("[v0] Error counting linked publications:", linkedError)
    }

    const totalInDB = totalPublications || 0
    const linkedInDB = linkedPublications || 0

    return NextResponse.json({
      total_in_ml: totalInML,
      total_publications: totalInDB,
      linked_publications: linkedInDB,
      unlinked_publications: totalInDB - linkedInDB,
      pending_import: Math.max(0, totalInML - totalInDB),
    })
  } catch (error) {
    console.error("Error fetching account stats:", error)
    return NextResponse.json({ error: "Error fetching stats" }, { status: 500 })
  }
}
