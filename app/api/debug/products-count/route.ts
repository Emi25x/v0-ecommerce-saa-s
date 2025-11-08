import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Contar total de productos
    const { count: totalCount, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error("[v0] Error contando productos:", countError)
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    // Obtener los últimos 10 productos
    const { data: recentProducts, error: recentError } = await supabase
      .from("products")
      .select("id, sku, title, internal_code, price, stock, created_at")
      .order("created_at", { ascending: false })
      .limit(10)

    if (recentError) {
      console.error("[v0] Error obteniendo productos recientes:", recentError)
    }

    // Obtener estadísticas por fuente
    const { data: sourceStats, error: sourceError } = await supabase.from("products").select("source")

    const sourceCounts: Record<string, number> = {}
    if (sourceStats) {
      for (const product of sourceStats) {
        const source = product.source || "sin fuente"
        sourceCounts[source] = (sourceCounts[source] || 0) + 1
      }
    }

    return NextResponse.json({
      totalProducts: totalCount || 0,
      recentProducts: recentProducts || [],
      sourceStats: sourceCounts,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("[v0] Error en diagnóstico:", error)
    return NextResponse.json(
      {
        error: error.message || "Error desconocido",
        details: error.toString(),
      },
      { status: 500 },
    )
  }
}
