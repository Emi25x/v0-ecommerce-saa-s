import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"

/**
 * GET /api/products/search
 * Busca productos por SKU, título, EAN o ISBN.
 * Query params:
 *   q      - search term (min 2 chars)
 *   limit  - max results (default 20, max 50)
 *   field  - "ean" | "isbn" | "sku" | "title" (optional; default = broad search)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get("q")
    const requestedLimit = parseInt(searchParams.get("limit") || "20")
    const field = searchParams.get("field") ?? ""
    const limit = Math.min(requestedLimit, 50)

    if (!q || q.trim().length < 2) {
      return NextResponse.json({
        error: "Query must be at least 2 characters",
      }, { status: 400 })
    }

    const supabase = await createClient()
    const query = q.trim()

    const SELECT_FIELDS =
      "id, sku, ean, isbn, title, author, stock, price, image_url, canonical_weight_g, brand, category, description"

    let dbQuery = supabase.from("products").select(SELECT_FIELDS).limit(limit)

    if (field === "ean") {
      dbQuery = dbQuery.eq("ean", query)
    } else if (field === "isbn") {
      dbQuery = dbQuery.eq("isbn", query)
    } else if (field === "sku") {
      dbQuery = dbQuery.ilike("sku", `%${query}%`)
    } else {
      // Broad: SKU partial, title, author, exact EAN, exact ISBN
      dbQuery = dbQuery.or(
        `sku.ilike.%${query}%,title.ilike.%${query}%,author.ilike.%${query}%,ean.eq.${query},isbn.eq.${query}`,
      )
    }

    const { data: products, error } = await dbQuery

    if (error) {
      console.error("[v0] Product search error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Sort: exact SKU/EAN match first
    const sorted = (products ?? []).sort((a, b) => {
      const ql = query.toLowerCase()
      const aExact = a.sku?.toLowerCase() === ql || a.ean === query || a.isbn === query
      const bExact = b.sku?.toLowerCase() === ql || b.ean === query || b.isbn === query
      if (aExact && !bExact) return -1
      if (!aExact && bExact) return 1
      return 0
    })

    return NextResponse.json({ products: sorted })
  } catch (error: any) {
    console.error("[v0] Product search error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
