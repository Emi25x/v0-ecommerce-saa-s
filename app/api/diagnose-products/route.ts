import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  try {
    console.log("[v0] DIAGNÓSTICO - INICIANDO")

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // 1. Total de productos usando count directo
    console.log("[v0] Contando total de productos...")
    const { count: totalProducts } = await supabase.from("products").select("*", { count: "exact", head: true })

    console.log("[v0] Total productos:", totalProducts)

    // 2. Obtener fuentes
    console.log("[v0] Obteniendo fuentes...")
    const { data: sources } = await supabase.from("import_sources").select("id, name")

    const sourceMap = new Map<string, string>()
    sources?.forEach((s: any) => sourceMap.set(s.id, s.name))
    console.log("[v0] Fuentes cargadas:", sourceMap.size)

    // 3. DETECTAR DUPLICADOS usando SQL directo
    console.log("[v0] Detectando duplicados con SQL...")

    // Normalizar SKUs y contar duplicados
    const { data: duplicatesData, error: dupError } = (await supabase
      .rpc("get_duplicate_skus", {})
      .catch(() => null)) as any

    let duplicateSKUs: string[] = []
    let totalDuplicateProducts = 0

    if (dupError || !duplicatesData) {
      // Fallback: obtener todos los SKUs y procesarlos
      console.log("[v0] RPC no disponible, usando fallback...")

      const skuCounts = new Map<string, { count: number; example: string }>()
      let offset = 0
      const batchSize = 20000

      while (true) {
        const { data: batch } = await supabase
          .from("products")
          .select("sku")
          .range(offset, offset + batchSize - 1)

        if (!batch || batch.length === 0) break

        batch.forEach((p: any) => {
          if (!p.sku) return
          const normalized = p.sku.toString().trim().toUpperCase().replace(/[\s-]/g, "")
          if (normalized) {
            const existing = skuCounts.get(normalized)
            if (existing) {
              existing.count++
            } else {
              skuCounts.set(normalized, { count: 1, example: p.sku })
            }
          }
        })

        console.log("[v0] Procesados:", offset + batch.length)
        if (batch.length < batchSize) break
        offset += batchSize
      }

      // Contar duplicados
      skuCounts.forEach((value, key) => {
        if (value.count > 1) {
          duplicateSKUs.push(value.example)
          totalDuplicateProducts += value.count - 1
        }
      })
    } else {
      duplicateSKUs = duplicatesData.map((d: any) => d.sku)
      totalDuplicateProducts = duplicatesData.reduce((sum: number, d: any) => sum + (d.count - 1), 0)
    }

    console.log("[v0] SKUs duplicados encontrados:", duplicateSKUs.length)
    console.log("[v0] Productos duplicados totales:", totalDuplicateProducts)

    // 4. Obtener muestra para títulos corruptos y distribución por fuentes
    console.log("[v0] Obteniendo muestra para análisis...")
    const { data: sample } = await supabase.from("products").select("sku, title, source").limit(5000)

    // Títulos corruptos
    const corruptedTitles = (sample || [])
      .filter((p: any) => {
        if (!p.title || p.title.trim() === "") return true
        if (/^\d+(\.\d+)?$/.test(p.title.trim())) return true
        if (p.title.length < 3) return true
        return false
      })
      .slice(0, 50)
      .map((p: any) => ({ sku: p.sku, title: p.title || "Sin título" }))

    console.log("[v0] Títulos corruptos:", corruptedTitles.length)

    // Distribución por fuentes
    const sourceCounts: Record<string, number> = {}
    sample?.forEach((p: any) => {
      const sourceId = p.source || "Sin fuente"
      const sourceName = sourceMap.get(sourceId) || sourceId
      sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1
    })

    const productsBySource = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    console.log("[v0] Distribución por fuentes:", productsBySource)
    console.log("[v0] DIAGNÓSTICO - COMPLETADO")

    return NextResponse.json({
      totalProducts: totalProducts || 0,
      duplicateSKUs: duplicateSKUs.slice(0, 100), // Primeros 100 ejemplos
      totalDuplicateSKUs: duplicateSKUs.length,
      totalDuplicateProducts,
      productsBySource,
      corruptedTitles,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("[v0] ERROR en diagnóstico:", error)
    console.error("[v0] Stack:", error.stack)
    return NextResponse.json({ error: error.message || "Error al diagnosticar" }, { status: 500 })
  }
}
