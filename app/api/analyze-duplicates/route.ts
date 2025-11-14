import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300

export async function GET() {
  try {
    console.log("[v0] 🔍 ANALIZANDO DUPLICADOS...")
    
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    console.log("[v0] 📥 Obteniendo TODOS los productos de la base de datos...")
    
    const allProducts = []
    let offset = 0
    const batchSize = 1000
    let batchNumber = 1
    
    while (true) {
      console.log(`[v0] 📦 Obteniendo lote ${batchNumber} (offset: ${offset})...`)
      
      const { data: batch, error: batchError } = await supabase
        .from("products")
        .select("sku")
        .not("sku", "is", null)
        .neq("sku", "")
        .range(offset, offset + batchSize - 1)
      
      if (batchError) {
        console.error(`[v0] ❌ Error obteniendo lote:`, batchError)
        throw batchError
      }
      
      if (!batch || batch.length === 0) {
        console.log(`[v0] ⚠️ Lote vacío, finalizando paginación`)
        break
      }
      
      allProducts.push(...batch)
      console.log(`[v0] ✅ Lote ${batchNumber}: ${batch.length} productos | Total acumulado: ${allProducts.length}`)
      
      // Si el lote es menor que batchSize, ya no hay más productos
      if (batch.length < batchSize) {
        console.log(`[v0] ✅ Último lote recibido (${batch.length} < ${batchSize})`)
        break
      }
      
      offset += batchSize
      batchNumber++
      
      // Límite de seguridad para evitar loops infinitos
      if (batchNumber > 500) {
        console.log(`[v0] ⚠️ Límite de seguridad alcanzado (500 lotes)`)
        break
      }
    }
    
    console.log(`[v0] 📊 TOTAL DE PRODUCTOS OBTENIDOS: ${allProducts.length}`)
    
    // Contar duplicados
    const skuMap = new Map<string, number>()
    
    allProducts.forEach((p: any) => {
      const normalizedSku = p.sku?.toString().trim().toUpperCase().replace(/[\s-]/g, "") || ""
      if (normalizedSku) {
        skuMap.set(normalizedSku, (skuMap.get(normalizedSku) || 0) + 1)
      }
    })
    
    console.log(`[v0] 📊 SKUs únicos normalizados: ${skuMap.size}`)
    
    const duplicates = Array.from(skuMap.entries()).filter(([_, count]) => count > 1)
    const totalDuplicateSKUs = duplicates.length
    const totalDuplicateProducts = duplicates.reduce((sum, [_, count]) => sum + (count - 1), 0)
    
    console.log(`[v0] 🔍 SKUs duplicados: ${totalDuplicateSKUs}`)
    console.log(`[v0] 🔍 Productos duplicados totales: ${totalDuplicateProducts}`)
    
    return NextResponse.json({
      totalProducts: allProducts.length,
      totalDuplicateSKUs,
      totalDuplicateProducts,
      isSample: false,
      message: `Análisis completo de ${allProducts.length} productos`
    })
    
  } catch (error: any) {
    console.error("[v0] ❌ ERROR:", error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
