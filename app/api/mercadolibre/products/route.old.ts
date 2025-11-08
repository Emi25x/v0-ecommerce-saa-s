import { type NextRequest, NextResponse } from "next/server"
import { getMercadoLibreProducts, getValidAccessToken } from "@/lib/mercadolibre"

export async function GET(request: NextRequest) {
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    const filters: any = {}

    const status = searchParams.get("status")
    if (status) filters.status = status

    const catalogListing = searchParams.get("catalog_listing")
    if (catalogListing) filters.catalog_listing = catalogListing === "true"

    const catalogEligible = searchParams.get("catalog_listing_eligible")
    if (catalogEligible) filters.catalog_listing_eligible = catalogEligible === "true"

    const listingType = searchParams.get("listing_type_id")
    if (listingType) filters.listing_type_id = listingType

    const search = searchParams.get("search")

    if (!userId) {
      return NextResponse.json({ error: "No user ID found" }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(userId)
    if (!accessToken) {
      return NextResponse.json({ error: "No valid access token found" }, { status: 401 })
    }

    const products = await getMercadoLibreProducts(accessToken, limit, offset, filters, search)

    return NextResponse.json(products)
  } catch (error) {
    console.error("Error fetching MercadoLibre products:", error)
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}
