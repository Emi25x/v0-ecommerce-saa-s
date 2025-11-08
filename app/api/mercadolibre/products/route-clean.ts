import { type NextRequest, NextResponse } from "next/server"
import { getMercadoLibreProducts, getValidAccessToken } from "@/lib/mercadolibre"

export async function GET(request: NextRequest) {
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "No MercadoLibre account connected" }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(userId)

    if (!accessToken) {
      return NextResponse.json({ error: "Failed to get valid access token" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const offset = Number.parseInt(searchParams.get("offset") || "0")
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const status = searchParams.get("status") || undefined
    const catalogListing = searchParams.get("catalog_listing") || undefined
    const listingType = searchParams.get("listing_type") || undefined
    const eligibility = searchParams.get("eligibility") || undefined
    const search = searchParams.get("search") || undefined

    const products = await getMercadoLibreProducts(accessToken, {
      offset,
      limit,
      status,
      catalog_listing: catalogListing,
      listing_type: listingType,
      eligibility,
      search,
    })

    return NextResponse.json(products)
  } catch (error) {
    console.error("Error fetching MercadoLibre products:", error)
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}
