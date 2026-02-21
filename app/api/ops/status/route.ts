import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  try {
    // 1. Obtener estado de proveedores
    const { data: providers, error: providersError } = await supabase
      .from("import_sources")
      .select("name, is_active, last_run, last_status")
      .order("name")

    if (providersError) throw providersError

    // 2. Calcular productos y stock por proveedor
    const providersWithStats = await Promise.all(
      (providers || []).map(async (provider) => {
        const sourceName = provider.name.toLowerCase()
        
        // Contar productos de este proveedor
        const { count: productsCount } = await supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("source", sourceName)
        
        // Sumar stock total del proveedor usando stock_by_source
        const { data: stockData } = await supabase
          .from("products")
          .select("stock_by_source")
          .eq("source", sourceName)
          .not("stock_by_source", "is", null)
        
        let stockTotal = 0
        stockData?.forEach((product: any) => {
          const stockBySource = product.stock_by_source || {}
          stockTotal += stockBySource[sourceName] || 0
        })

        return {
          ...provider,
          products_count: productsCount || 0,
          stock_total: stockTotal
        }
      })
    )

    // 3. Estadísticas generales del sistema
    const { count: totalProducts } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    const { count: withStock } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .gt("stock", 0)

    const { count: withoutEan } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .or("ean.is.null,ean.eq.")

    const { count: pendingPublish } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .gt("stock", 0)
      .is("ml_item_id", null)

    // 4. Estadísticas de MercadoLibre
    const { count: totalPublished } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .not("ml_item_id", "is", null)

    const { count: activeListings } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .not("ml_item_id", "is", null)
      .eq("ml_status", "active")

    const { count: pausedListings } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .not("ml_item_id", "is", null)
      .eq("ml_status", "paused")

    // Ventas (si tienes el campo ml_sold_quantity)
    const { data: salesData } = await supabase
      .from("products")
      .select("ml_sold_quantity")
      .not("ml_item_id", "is", null)
      .not("ml_sold_quantity", "is", null)

    const soldCount = salesData?.reduce((sum: number, p: any) => sum + (p.ml_sold_quantity || 0), 0) || 0

    return NextResponse.json({
      providers: providersWithStats,
      system_stats: {
        total_products: totalProducts || 0,
        with_stock: withStock || 0,
        without_ean: withoutEan || 0,
        pending_publish: pendingPublish || 0
      },
      ml_stats: {
        total_published: totalPublished || 0,
        active_listings: activeListings || 0,
        paused_listings: pausedListings || 0,
        sold_count: soldCount,
        visits_30d: 0 // Placeholder: requiere integración con API de ML
      }
    })

  } catch (error: any) {
    console.error("[v0] Ops status error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch ops status" },
      { status: 500 }
    )
  }
}
