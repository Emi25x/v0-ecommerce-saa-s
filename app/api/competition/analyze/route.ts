import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(request: Request) {
  try {
    const { item_id } = await request.json()

    if (!item_id) {
      return NextResponse.json({ success: false, error: "item_id es requerido" }, { status: 400 })
    }

    const { data: listing, error: listingError } = await supabase
      .from("ml_listings")
      .select("*, ml_accounts(access_token, token_expires_at, refresh_token)")
      .eq("ml_id", item_id)
      .maybeSingle()

    // Si no encontramos en la BD, buscar el access token de cualquier cuenta activa
    let accessToken = listing?.ml_accounts?.access_token

    if (!accessToken) {
      console.log("[v0] No listing found in DB, fetching from any active account")
      const { data: accounts } = await supabase
        .from("ml_accounts")
        .select("access_token, token_expires_at")
        .gt("token_expires_at", new Date().toISOString())
        .limit(1)
        .single()

      if (!accounts || !accounts.access_token) {
        return NextResponse.json(
          { success: false, error: "No se encontró una cuenta de MercadoLibre activa" },
          { status: 401 },
        )
      }

      accessToken = accounts.access_token
    }

    const priceToWinUrl = `https://api.mercadolibre.com/items/${item_id}/price_to_win?siteId=MLA&version=v2`

    console.log("[v0] Analyzing competition with price_to_win:", priceToWinUrl)

    const response = await fetch(priceToWinUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] price_to_win error:", errorText)
      return NextResponse.json(
        { success: false, error: `ML API error: ${response.status} - ${errorText}` },
        { status: response.status },
      )
    }

    const competitionData = await response.json()

    console.log("[v0] Competition data:", JSON.stringify(competitionData, null, 2))

    return NextResponse.json({
      success: true,
      competition: {
        status: competitionData.status,
        current_price: competitionData.current_price,
        price_to_win: competitionData.price_to_win,
        currency_id: competitionData.currency_id,
        visit_share: competitionData.visit_share,
        competitors_sharing_first_place: competitionData.competitors_sharing_first_place || 0,
        boosts: competitionData.boosts || [],
        winner_item_id: competitionData.winner?.item_id || null,
        winner_price: competitionData.winner?.price || null,
        winner_boosts: competitionData.winner?.boosts || [],
        catalog_product_id: competitionData.catalog_product_id || null,
        winner: competitionData.winner
          ? {
              seller_id: competitionData.winner.seller_id || null,
              nickname: competitionData.winner.nickname || "Desconocido",
              price: competitionData.winner.price || null,
              advantages: competitionData.winner.boosts || [],
            }
          : null,
      },
      message: `Estado de competencia: ${competitionData.status}`,
    })
  } catch (error: any) {
    console.error("Error analyzing competition:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
