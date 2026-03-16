import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const searchParams = request.nextUrl.searchParams
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "100")
    const offset = (page - 1) * limit
    const sortBy = searchParams.get("sortBy") || "id"
    const sortOrder = searchParams.get("sortOrder") || "desc"
    const search = searchParams.get("search") || ""

    const validSortColumns = ["id", "sku", "title", "price", "stock", "created_at", "updated_at"]
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : "id"

    if (search && search.trim().length < 3 && search.trim().length > 0) {
      return NextResponse.json(
        { products: [], page: 1, limit, total: 0, totalPages: 1, message: "La búsqueda requiere al menos 3 caracteres" },
        { status: 200 }
      )
    }

    const FULL_SELECT = "id, sku, title, ean, isbn, price, stock, source, created_at, updated_at, image_url, author, brand, language, pages, binding, category, description, year_edition, height, width, thickness, canonical_weight_g, cost_price, custom_fields"
    const SAFE_SELECT = "id, sku, title, ean, price, stock, source, created_at, updated_at, image_url, brand, category, description, custom_fields"
    const countType = search ? "exact" : "estimated"

    function buildQuery(selectCols: string) {
      let q = supabase.from("products").select(selectCols, { count: countType })
      if (search) {
        const trimmedSearch = search.trim()
        const isNumericCode = /^\d{10,}$/.test(trimmedSearch)
        if (isNumericCode) {
          q = q.or(`ean.eq.${trimmedSearch},sku.eq.${trimmedSearch}`)
        } else {
          q = q.or(`sku.ilike.${trimmedSearch},sku.ilike.%${trimmedSearch}%,title.ilike.%${trimmedSearch}%`)
        }
      }
      return q.order(safeSortBy, { ascending: sortOrder === "asc" }).range(offset, offset + limit - 1)
    }

    let { data: products, error, count } = await buildQuery(FULL_SELECT)

    // Si falla por columnas inexistentes, reintentar con columnas seguras
    if (error && error.message?.includes("column")) {
      console.warn(`[products] select completo falló: ${error.message}, reintentando con columnas base`)
      const retry = await buildQuery(SAFE_SELECT)
      products = retry.data
      error = retry.error
      count = retry.count
    }

    if (error) {
      if (error.message.includes("timeout") || error.message.includes("canceling statement")) {
        return NextResponse.json(
          { error: "La búsqueda tardó demasiado. Intenta buscar por SKU/ISBN/EAN exacto.", timeout: true },
          { status: 504 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: importSources } = await supabase.from("import_sources").select("id, name")

    const sourceMapById = new Map<string, string>()
    const sourceMapByName = new Map<string, string>()
    if (importSources) {
      for (const source of importSources) {
        sourceMapById.set(source.id, source.name)
        sourceMapByName.set(source.name, source.name)
      }
    }

    const normalizedProducts = products?.map((product) => {
      const sourceIds = Array.isArray(product.source) ? product.source : product.source ? [product.source] : []

      const sourceNames = sourceIds
        .map((idOrName: string) => {
          const nameById = sourceMapById.get(idOrName)
          if (nameById) return nameById
          const nameByName = sourceMapByName.get(idOrName)
          if (nameByName) return nameByName
          return idOrName
        })
        .filter((name: string) => name)

      return {
        ...product,
        source: sourceNames,
      }
    })

    const totalCount = count || 0
    const calculatedPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 1

    return NextResponse.json({
      products: normalizedProducts || [],
      page,
      limit,
      total: totalCount,
      totalPages: calculatedPages,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const body = await request.json()

    const { sku, title, description, price, stock, image_url, category, brand } = body

    if (!sku || !title || price === undefined || stock === undefined) {
      return NextResponse.json({ error: "Missing required fields: sku, title, price, stock" }, { status: 400 })
    }

    const { data: product, error } = await supabase
      .from("products")
      .insert({
        sku,
        title,
        description,
        price,
        stock,
        image_url,
        category,
        brand,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating product:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    console.error("Error in POST /api/inventory/products:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
