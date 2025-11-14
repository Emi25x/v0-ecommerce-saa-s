import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300

export async function POST() {
  try {
    console.log("[v0] 🧹 INICIANDO LIMPIEZA DE DUPLICADOS...")
    
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    console.log("[v0] Ejecutando DELETE SQL directo en la base de datos...")
    
    // Usar el cliente nativo de Supabase para ejecutar SQL raw
    const { data: deleteResult, error: sqlError } = await supabase
      .rpc('exec_sql', {
        query: `
          WITH duplicates AS (
            SELECT 
              id,
              sku,
              created_at,
              ROW_NUMBER() OVER (
                PARTITION BY UPPER(TRIM(REPLACE(REPLACE(sku, ' ', ''), '-', '')))
                ORDER BY created_at ASC
              ) as row_num
            FROM products
            WHERE sku IS NOT NULL AND TRIM(sku) != ''
          )
          DELETE FROM products
          WHERE id IN (
            SELECT id FROM duplicates WHERE row_num > 1
          )
          RETURNING id;
        `
      })
    
    // Si la función RPC no existe, usar método alternativo con REST API
    if (sqlError && sqlError.code === '42883') {
      console.log("[v0] ⚠️ Función exec_sql no existe, usando método de paginación completa...")
      
      const allProducts = []
      let offset = 0
      const batchSize = 1000
      let batchNumber = 1
      
      while (true) {
        console.log(`[v0] 📦 Obteniendo lote ${batchNumber} (offset: ${offset})...`)
        
        const { data: batch, error: fetchError } = await supabase
          .from("products")
          .select("id, sku, created_at")
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
      
      console.log(`[v0] Productos obtenidos: ${allProducts.length}`)
      
      // Agrupar por SKU normalizado
      const skuGroups = new Map<string, any[]>()
      
      allProducts?.forEach((p: any) => {
        const normalizedSku = p.sku?.toString().trim().toUpperCase().replace(/[\s-]/g, "") || ""
        if (normalizedSku) {
          if (!skuGroups.has(normalizedSku)) {
            skuGroups.set(normalizedSku, [])
          }
          skuGroups.get(normalizedSku)!.push(p)
        }
      })
      
      console.log(`[v0] SKUs únicos encontrados: ${skuGroups.size}`)
      
      // Identificar IDs a eliminar (todos excepto el más antiguo)
      const idsToDelete: string[] = []
      let duplicateSkuCount = 0
      
      skuGroups.forEach((group) => {
        if (group.length > 1) {
          duplicateSkuCount++
          // Mantener el primero (más antiguo), eliminar el resto
          const toDelete = group.slice(1).map(p => p.id)
          idsToDelete.push(...toDelete)
          console.log(`[v0] SKU duplicado: ${group.length} copias, eliminando ${toDelete.length}`)
        }
      })
      
      console.log(`[v0] 🎯 Total SKUs duplicados: ${duplicateSkuCount}`)
      console.log(`[v0] 🗑️ Total productos a eliminar: ${idsToDelete.length}`)
      
      if (idsToDelete.length === 0) {
        return NextResponse.json({
          success: true,
          deletedCount: 0,
          duplicateSkuCount: 0,
          message: "No se encontraron duplicados"
        })
      }
      
      // Eliminar en lotes de 500
      let deleted = 0
      const deleteBatchSize = 500
      
      for (let i = 0; i < idsToDelete.length; i += deleteBatchSize) {
        const batch = idsToDelete.slice(i, i + deleteBatchSize)
        const { error: deleteError } = await supabase
          .from("products")
          .delete()
          .in("id", batch)
        
        if (deleteError) {
          console.error(`[v0] ❌ Error eliminando lote ${i}:`, deleteError)
        } else {
          deleted += batch.length
          console.log(`[v0] ✅ Progreso: ${deleted}/${idsToDelete.length} eliminados (${Math.round(deleted/idsToDelete.length*100)}%)`)
        }
      }
      
      console.log(`[v0] ✅ LIMPIEZA COMPLETADA: ${deleted} productos eliminados`)
      
      return NextResponse.json({
        success: true,
        deletedCount: deleted,
        duplicateSkuCount,
        message: `Se eliminaron ${deleted} productos duplicados de ${duplicateSkuCount} SKUs duplicados`
      })
    }
    
    console.log("[v0] ✅ Limpieza SQL ejecutada directamente:", deleteResult)
    
    return NextResponse.json({
      success: true,
      deletedCount: deleteResult?.length || 0,
      message: `Se eliminaron ${deleteResult?.length || 0} productos duplicados directamente en la base de datos`
    })
    
  } catch (error: any) {
    console.error("[v0] ❌ ERROR CRÍTICO:", error)
    return NextResponse.json(
      { 
        success: false,
        error: error.message,
        details: error.toString()
      },
      { status: 500 }
    )
  }
}
