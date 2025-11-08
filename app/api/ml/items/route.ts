import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  console.log("[v0] ========================================")
  console.log("[v0] GET /api/ml/items - STARTING")
  console.log("[v0] ========================================")

  const searchParams = request.nextUrl.searchParams
  const limit = Number.parseInt(searchParams.get("limit") || "50")
  const offset = Number.parseInt(searchParams.get("offset") || "0")
  const accountId = searchParams.get("account_id")
  const status = searchParams.get("status")
  const catalogListing = searchParams.get("catalog_listing")
  const listingType = searchParams.get("listing_type")
  const tags = searchParams.get("tags")
  const subStatus = searchParams.get("sub_status")
  const sort = searchParams.get("sort") || "sold_quantity_desc"

  try {
    console.log("[v0] Creating Supabase client...")
    const supabase = await createServerClient()
    console.log("[v0] Supabase client created successfully")

    console.log("[v0] Querying mercadolibre_accounts...")
    let accountsQuery = supabase.from("mercadolibre_accounts").select("*")

    if (accountId && accountId !== "all") {
      accountsQuery = accountsQuery.eq("id", accountId)
    }

    const { data: accounts, error: accountsError } = await accountsQuery

    if (accountsError) {
      console.error("[v0] Error fetching accounts:", accountsError)
      return NextResponse.json({ error: accountsError.message }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      console.log("[v0] No accounts found")
      return NextResponse.json({ products: [], paging: { total: 0, limit, offset } })
    }

    console.log(`[v0] Found ${accounts.length} account(s)`)
    const account = accounts[0]
    const accessToken = account.access_token

    if (!accessToken) {
      console.error("[v0] No access token available for account:", account.id)
      return NextResponse.json({ error: "No access token available" }, { status: 401 })
    }

    let searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?limit=${limit}&offset=${offset}`

    if (status && status !== "all") searchUrl += `&status=${status}`
    if (catalogListing === "true") searchUrl += `&catalog_listing=true`
    if (catalogListing === "false") searchUrl += `&catalog_listing=false`
    if (listingType && listingType !== "all") searchUrl += `&listing_type=${listingType}`
    if (tags && tags !== "all") searchUrl += `&tags=${tags}`
    if (subStatus && subStatus !== "all") searchUrl += `&sub_status=${subStatus}`

    console.log("[v0] Fetching products from ML API:", searchUrl)

    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error("[v0] ML API error:", searchResponse.status, errorText)
      return NextResponse.json({ error: "Failed to fetch from MercadoLibre" }, { status: searchResponse.status })
    }

    const searchData = await searchResponse.json()
    const itemIds = searchData.results || []

    console.log("[v0] Found", itemIds.length, "product IDs")

    if (itemIds.length === 0) {
      console.log("[v0] No products found, returning empty array")
      return NextResponse.json({
        products: [],
        paging: searchData.paging || { total: 0, limit, offset },
      })
    }

    const chunkSize = 20
    const chunks: string[][] = []
    for (let i = 0; i < itemIds.length; i += chunkSize) {
      chunks.push(itemIds.slice(i, i + chunkSize))
    }

    console.log("[v0] Processing", chunks.length, "chunks of products")

    let allProducts: any[] = []

    for (const chunk of chunks) {
      const itemsUrl = `https://api.mercadolibre.com/items?ids=${chunk.join(",")}`
      console.log("[v0] Fetching chunk:", itemsUrl)

      const itemsResponse = await fetch(itemsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!itemsResponse.ok) {
        console.error("[v0] Failed to fetch items chunk:", itemsResponse.status)
        continue
      }

      const itemsData = await itemsResponse.json()
      const products = itemsData.map((item: any) => item.body).filter(Boolean)

      console.log("[v0] Received", products.length, "products in chunk")

      const productsWithAccount = products.map((product: any) => ({
        ...product,
        account_id: account.id,
        account_nickname: account.nickname,
      }))

      allProducts = allProducts.concat(productsWithAccount)
      console.log("[v0] Total products so far:", allProducts.length)
    }

    const sortedProducts = [...allProducts].sort((a, b) => {
      switch (sort) {
        case "sold_quantity_desc":
          return (b.sold_quantity || 0) - (a.sold_quantity || 0)
        case "sold_quantity_asc":
          return (a.sold_quantity || 0) - (b.sold_quantity || 0)
        case "price_desc":
          return (b.price || 0) - (a.price || 0)
        case "price_asc":
          return (a.price || 0) - (b.price || 0)
        case "date_desc":
          return new Date(b.date_created || 0).getTime() - new Date(a.date_created || 0).getTime()
        case "date_asc":
          return new Date(a.date_created || 0).getTime() - new Date(b.date_created || 0).getTime()
        default:
          return 0
      }
    })

    console.log("[v0] Returning", sortedProducts.length, "products")
    console.log("[v0] ========================================")

    return NextResponse.json({
      products: sortedProducts,
      paging: searchData.paging || { total: allProducts.length, limit, offset },
    })
  } catch (error) {
    console.error("[v0] ❌❌❌ CRITICAL ERROR in GET /api/ml/items:", error)
    console.error("[v0] Error type:", error instanceof Error ? error.constructor.name : typeof error)
    console.error("[v0] Error message:", error instanceof Error ? error.message : String(error))
    console.error("[v0] Error stack:", error instanceof Error ? error.stack : "No stack trace")
    console.error("[v0] ========================================")

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
