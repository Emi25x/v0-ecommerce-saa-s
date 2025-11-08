import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Contar total de productos
    const { count: totalCount, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    if (countError) {
      return NextResponse.json({
        success: false,
        error: countError.message,
      })
    }

    // Obtener últimos 10 productos
    const { data: recentProducts, error: recentError } = await supabase
      .from("products")
      .select("sku, title, internal_code, created_at, source")
      .order("created_at", { ascending: false })
      .limit(10)

    // Contar por fuente
    const { data: bySource, error: sourceError } = await supabase.from("products").select("source")

    const sourceStats: Record<string, number> = {}
    if (bySource) {
      bySource.forEach((p) => {
        const source = p.source || "sin_fuente"
        sourceStats[source] = (sourceStats[source] || 0) + 1
      })
    }

    return NextResponse.json({
      success: true,
      totalProducts: totalCount || 0,
      recentProducts: recentProducts || [],
      bySource: sourceStats,
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    })
  }
}
