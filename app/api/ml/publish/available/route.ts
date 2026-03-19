import { createClient } from "@/lib/db/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const showAll = searchParams.get("show_all") === "true"
    const onlyIds = searchParams.get("only_ids") === "true"
    const accountId = searchParams.get("account_id") || ""
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("page_size") || "100")
    const minStock = parseInt(searchParams.get("min_stock") || "5")
    const minPrice = parseFloat(searchParams.get("min_price") || "0")
    const maxPrice = parseFloat(searchParams.get("max_price") || "999999")
    const language = searchParams.get("language") || ""
    const brand = searchParams.get("brand") || ""
    const search = searchParams.get("search") || ""
    const excludeIbd = searchParams.get("exclude_ibd") !== "false"

    // Obtener los product_ids ya publicados en la cuenta seleccionada
    // Si hay account_id, usar ml_publications (per-cuenta); si no, caer al campo global
    let publishedProductIds: string[] = []
    if (!showAll && accountId) {
      const { data: pubRows } = await supabase.from("ml_publications").select("product_id").eq("account_id", accountId)
      publishedProductIds = (pubRows || []).map((r) => r.product_id)
    }

    // Si solo necesitamos IDs (para publicación masiva)
    if (onlyIds) {
      const allIds: string[] = []
      let offset = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        let query = supabase
          .from("products")
          .select("id, ml_item_id")
          .gt("cost_price", 0)
          .gte("stock", minStock)
          .gte("cost_price", minPrice)
          .lte("cost_price", maxPrice)

        // Filtrar NO publicados: per-cuenta si hay account_id, global si no
        if (!showAll) {
          if (accountId) {
            if (publishedProductIds.length > 0) {
              query = query.not("id", "in", `(${publishedProductIds.join(",")})`)
            }
            // Si publishedProductIds está vacío, no hay nada que excluir → todos disponibles
          } else {
            query = query.is("ml_item_id", null)
          }
        }

        // Filtrar IBD
        if (excludeIbd) {
          query = query.or("is_ibd.is.null,is_ibd.eq.false")
        }

        if (language) {
          query = query.ilike("language", language)
        }
        if (brand) {
          query = query.ilike("brand", `%${brand}%`)
        }
        if (search) {
          query = query.or(`title.ilike.%${search}%,ean.ilike.%${search}%`)
        }

        const { data: batch } = await query.range(offset, offset + batchSize - 1)

        if (!batch || batch.length === 0) {
          hasMore = false
        } else {
          allIds.push(...batch.map((p) => p.id))
          offset += batchSize
          if (batch.length < batchSize) hasMore = false
        }
      }

      // Contar publicados en la cuenta seleccionada (o globalmente si no hay cuenta)
      let publishedCount = 0
      if (accountId) {
        const { count } = await supabase
          .from("ml_publications")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId)
        publishedCount = count || 0
      } else {
        const { count } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .not("ml_item_id", "is", null)
        publishedCount = count || 0
      }

      return NextResponse.json({
        ids: allIds,
        total: allIds.length,
        published_count: publishedCount,
      })
    }

    // Query normal paginada para mostrar en UI
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from("products")
      .select(
        "id, ean, title, cost_price, price, stock, brand, image_url, language, is_ibd, ml_item_id, ml_status, ml_published_at",
      )
      .gt("cost_price", 0)
      .gte("stock", minStock)
      .gte("cost_price", minPrice)
      .lte("cost_price", maxPrice)

    // Filtrar NO publicados: per-cuenta si hay account_id, global si no
    if (!showAll) {
      if (accountId) {
        if (publishedProductIds.length > 0) {
          query = query.not("id", "in", `(${publishedProductIds.join(",")})`)
        }
      } else {
        query = query.is("ml_item_id", null)
      }
    }

    // Filtrar IBD
    if (excludeIbd) {
      query = query.or("is_ibd.is.null,is_ibd.eq.false")
    }

    if (language) {
      query = query.ilike("language", language)
    }
    if (brand) {
      query = query.ilike("brand", `%${brand}%`)
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,ean.ilike.%${search}%`)
    }

    const { data: allProducts, error } = await query.range(from, to)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Contar publicados en la cuenta seleccionada (o globalmente si no hay cuenta)
    let publishedCount = 0
    if (accountId) {
      const { count } = await supabase
        .from("ml_publications")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
      publishedCount = count || 0
    } else {
      const { count } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .not("ml_item_id", "is", null)
      publishedCount = count || 0
    }
    // Marcar cuales estan publicados (per-cuenta si hay account_id, global si no)
    const publishedSet = new Set(publishedProductIds)
    const productsWithStatus = (allProducts || []).map((p) => ({
      ...p,
      is_published: accountId ? publishedSet.has(p.id) : !!p.ml_item_id,
    }))

    const hasMore = (allProducts?.length || 0) >= pageSize

    return NextResponse.json({
      products: productsWithStatus,
      total: productsWithStatus.length,
      published_count: publishedCount || 0,
      page,
      page_size: pageSize,
      min_stock: minStock,
      show_all: showAll,
      has_more: hasMore,
    })
  } catch (error) {
    console.error("Error fetching available products:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
