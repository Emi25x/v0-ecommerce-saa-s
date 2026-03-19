import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300

export async function GET() {
  try {
    console.log("[v0] 🔍 ANALIZANDO DUPLICADOS...")

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    console.log("[v0] 📥 Obteniendo TODOS los productos de la base de datos...")

    const allProducts = []
    let offset = 0
    const batchSize = 1000
    let batchNumber = 1

    while (true) {
      console.log(`[v0] 📦 Obteniendo lote ${batchNumber} (offset: ${offset})...`)

      const { data: batch, error: fetchError } = await supabase
        .from("products")
        .select("sku")
        .not("sku", "is", null)
        .neq("sku", "")
        .range(offset, offset + batchSize - 1)

      if (fetchError) {
        console.error(`[v0] ❌ Error obteniendo lote:`, fetchError)
        throw fetchError
      }

      if (!batch || batch.length === 0) {
        console.log(`[v0] ⚠️ Lote vacío, finalizando paginación`)
        break
      }

      allProducts.push(...batch)
      console.log(`[v0] ✅ Lote ${batchNumber}: ${batch.length} productos | Total acumulado: ${allProducts.length}`)

      if (batch.length < batchSize) {
        console.log(`[v0] ✅ Último lote recibido`)
        break
      }

      offset += batchSize
      batchNumber++

      if (batchNumber > 500) {
        console.log(`[v0] ⚠️ Límite de seguridad alcanzado`)
        break
      }
    }

    console.log(`[v0] ✅ Total productos obtenidos: ${allProducts.length}`)

    const skuMap = new Map<string, number>()

    allProducts?.forEach((p: any) => {
      const normalizedSku = p.sku?.toString().trim().toUpperCase().replace(/[\s-]/g, "") || ""
      if (normalizedSku) {
        skuMap.set(normalizedSku, (skuMap.get(normalizedSku) || 0) + 1)
      }
    })

    const duplicates = Array.from(skuMap.entries()).filter(([_, count]) => count > 1)
    const totalDuplicateSKUs = duplicates.length
    const totalDuplicateProducts = duplicates.reduce((sum, [_, count]) => sum + (count - 1), 0)

    console.log(`[v0] 📊 Total productos analizados: ${allProducts.length}`)
    console.log(`[v0] 🔍 SKUs duplicados encontrados: ${totalDuplicateSKUs}`)
    console.log(`[v0] 🗑️ Productos duplicados a eliminar: ${totalDuplicateProducts}`)

    return NextResponse.json({
      totalProducts: allProducts.length,
      totalDuplicateSKUs,
      totalDuplicateProducts,
      isSample: false,
      message: `Análisis completo de ${allProducts.length} productos`,
    })
  } catch (error: any) {
    console.error("[v0] ❌ ERROR:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
