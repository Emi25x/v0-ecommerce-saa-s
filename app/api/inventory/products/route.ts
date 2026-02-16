import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  console.log("[v0] ========================================")
  console.log("[v0] GET /api/inventory/products - STARTING")
  console.log("[v0] ========================================")

  try {
    console.log("[v0] Creating Supabase client...")
    const supabase = await createClient()
    console.log("[v0] Supabase client created successfully")

    const searchParams = request.nextUrl.searchParams
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "100")
    const offset = (page - 1) * limit
    const sortBy = searchParams.get("sortBy") || "id"
    const sortOrder = searchParams.get("sortOrder") || "desc"
    const search = searchParams.get("search") || ""

    const validSortColumns = ["id", "sku", "title", "price", "stock", "created_at", "updated_at"]
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : "id"

    console.log(
      `[v0] Query params: page=${page}, limit=${limit}, offset=${offset}, sortBy=${safeSortBy}, sortOrder=${sortOrder}, search="${search}"`,
    )

    // Si la búsqueda es muy corta, rechazar búsqueda fuzzy
    if (search && search.trim().length < 3 && search.trim().length > 0) {
      return NextResponse.json(
        {
          products: [],
          page: 1,
          limit,
          total: 0,
          totalPages: 1,
          message: "La búsqueda requiere al menos 3 caracteres"
        },
        { status: 200 }
      )
    }

    console.log("[v0] Building query...")
    
    // NO usar select("*") - seleccionar solo columnas necesarias para el listado
    const selectColumns = "id, sku, title, price, stock, source, created_at, updated_at, image_url"
    
    // Usar count: "estimated" para listados sin búsqueda (más rápido)
    // count: "exact" solo cuando hay búsqueda activa
    const countType = search ? "exact" : "estimated"
    let query = supabase.from("products").select(selectColumns, { count: countType })

    if (search) {
      const trimmedSearch = search.trim()
      
      // Detectar si es un código numérico largo (ISBN/EAN/GTIN: >= 10 dígitos)
      const isNumericCode = /^\d{10,}$/.test(trimmedSearch)
      
      if (isNumericCode) {
        // Búsqueda exacta en códigos de barras
        console.log(`[v0] Numeric code search (ISBN/EAN/GTIN): "${trimmedSearch}"`)
        query = query.or(`ean.eq.${trimmedSearch},isbn.eq.${trimmedSearch},gtin.eq.${trimmedSearch},sku.eq.${trimmedSearch}`)
      } else {
        console.log(`[v0] SKU/title search: "${trimmedSearch}"`)
        
        // Búsqueda fuzzy en SKU y title (ilike hace búsqueda case-insensitive)
        // Nota: PostgreSQL ILIKE no ignora tildes por defecto, pero es lo mejor disponible sin índices especiales
        query = query.or(`sku.ilike.${trimmedSearch},sku.ilike.%${trimmedSearch}%,title.ilike.%${trimmedSearch}%`)
      }
    }

    console.log("[v0] Executing query...")
    const {
      data: products,
      error,
      count,
    } = await query.order(safeSortBy, { ascending: sortOrder === "asc" }).range(offset, offset + limit - 1)

    if (error) {
      console.error("[v0] ❌ Error fetching products:", error)
      console.error("[v0] Error details:", JSON.stringify(error, null, 2))

      if (error.message.includes("timeout") || error.message.includes("canceling statement")) {
        return NextResponse.json(
          {
            error: "La búsqueda tardó demasiado. Intenta buscar por SKU/ISBN/EAN exacto o un término más específico.",
            timeout: true,
            hint: "Usa códigos exactos para búsquedas más rápidas"
          },
          { status: 504 },
        )
      }

      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[v0] ✅ Query successful - Total count: ${count}, Fetched: ${products?.length || 0}`)

    console.log("[v0] Fetching import sources...")
    const { data: importSources, error: sourcesError } = await supabase.from("import_sources").select("id, name")

    if (sourcesError) {
      console.error("[v0] ⚠️ Error fetching import sources:", sourcesError)
    } else {
      console.log(`[v0] ✅ Fetched ${importSources?.length || 0} import sources`)
    }

    const sourceMapById = new Map<string, string>()
    const sourceMapByName = new Map<string, string>()
    if (importSources) {
      for (const source of importSources) {
        sourceMapById.set(source.id, source.name)
        sourceMapByName.set(source.name, source.name)
      }
    }

    console.log("[v0] Normalizing products...")
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

    // Asegurar que totalPages nunca sea 0 para evitar "Página 1 de 0"
    const totalCount = count || 0
    const calculatedPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 1
    
    const response = {
      products: normalizedProducts || [],
      page,
      limit,
      total: totalCount,
      totalPages: calculatedPages,
    }

    console.log("[v0] ✅ Returning products successfully")
    console.log("[v0] ========================================")
    return NextResponse.json(response)
  } catch (error) {
    console.error("[v0] ❌❌❌ CRITICAL ERROR in GET /api/inventory/products:", error)
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
