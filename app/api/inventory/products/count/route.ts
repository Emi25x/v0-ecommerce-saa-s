import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Contar productos
    const { count, error } = await supabase.from("products").select("*", { count: "exact", head: true })

    if (error) {
      console.error("[v0] Error contando productos:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Obtener algunos productos de ejemplo
    const { data: sampleProducts, error: sampleError } = await supabase
      .from("products")
      .select("sku, title, internal_code, created_at")
      .order("created_at", { ascending: false })
      .limit(10)

    if (sampleError) {
      console.error("[v0] Error obteniendo productos de ejemplo:", sampleError)
    }

    console.log("[v0] Total de productos en DB:", count)
    console.log("[v0] Productos de ejemplo:", sampleProducts)

    return NextResponse.json({
      count,
      sampleProducts: sampleProducts || [],
    })
  } catch (error) {
    console.error("[v0] Error en count endpoint:", error)
    return NextResponse.json({ error: "Error verificando productos" }, { status: 500 })
  }
}
