import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: credentials, error: credError } = await supabase
      .from("ml_credentials")
      .select("access_token, user_id")
      .single()

    if (credError || !credentials) {
      return NextResponse.json({ error: "No MercadoLibre credentials found" }, { status: 401 })
    }

    const { access_token, user_id } = credentials

    const claimsUrl = `https://api.mercadolibre.com/post-purchase/v1/claims/search?seller_id=${user_id}&status=opened`

    const response = await fetch(claimsUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] Error fetching claims:", errorText)
      return NextResponse.json({ error: "Failed to fetch claims", details: errorText }, { status: response.status })
    }

    const claimsData = await response.json()

    return NextResponse.json({
      claims: claimsData.data || [],
      total: claimsData.paging?.total || 0,
    })
  } catch (error) {
    console.error("[v0] Error in claims route:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
