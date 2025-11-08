import { type NextRequest, NextResponse } from "next/server"
import { getValidAccessToken, getProductAdsCampaigns, createProductAdsCampaign } from "@/lib/mercadolibre"

export async function GET(request: NextRequest) {
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(userId)
    const campaigns = await getProductAdsCampaigns(accessToken, userId)

    return NextResponse.json(campaigns)
  } catch (error) {
    console.error("[v0] Get campaigns error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to fetch campaigns", details: errorMessage }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(userId)
    const campaignData = await request.json()

    const campaign = await createProductAdsCampaign(accessToken, campaignData)

    return NextResponse.json(campaign)
  } catch (error) {
    console.error("[v0] Create campaign error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to create campaign", details: errorMessage }, { status: 500 })
  }
}
