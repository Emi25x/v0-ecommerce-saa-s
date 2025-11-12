import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutos para procesar todos los productos

export async function POST() {
  try {
    console.log("[v0] LIMPIEZA DE DUPLICADOS - INICIANDO")

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Paso 1: Obtener todos los productos y agrupar por SKU normalizado
    console.log("[v0] Obteniendo todos los productos...")
    const skuGroups = new Map<string, Array<{ id: string; sku: string; created_at: string }>>()
    let offset = 0
    const batchSize = 10000

    while (true) {
      const { data: batch, error } = await supabase
        .from("products")
        .select("id, sku, created_at")
        .range(offset, offset + batchSize - 1)
        .order("created_at", { ascending: true }) // Ordenar por fecha, más antiguo primero

      if (error) {
        console.error("[v0] Error obteniendo productos:", error)
        throw error
      }

      if (!batch || batch.length === 0) break

      // Agrupar por SKU normalizado
      batch.forEach((p) => {
        if (!p.sku) return

        // Normalizar SKU: trim, uppercase, sin espacios ni guiones
        const normalized = p.sku.toString().trim().toUpperCase().replace(/[\s-]/g, "")
        if (!normalized) return

        if (!skuGroups.has(normalized)) {
          skuGroups.set(normalized, [])
        }
        skuGroups.get(normalized)!.push({
          id: p.id,
          sku: p.sku,
          created_at: p.created_at,
        })
      })

      console.log(`[v0] Procesados: ${offset + batch.length} productos`)
      if (batch.length < batchSize) break
      offset += batchSize
    }

    console.log(`[v0] Total de productos analizados: ${offset}`)
    console.log(`[v0] Total de SKUs únicos (normalizados): ${skuGroups.size}`)

    // Paso 2: Identificar IDs a eliminar (todos excepto el primero/más antiguo de cada grupo)
    const idsToDelete: string[] = []
    let duplicateSkuCount = 0

    skuGroups.forEach((products, normalizedSKU) => {
      if (products.length > 1) {
        duplicateSkuCount++
        // Los productos ya vienen ordenados por created_at (más antiguo primero)
        // Mantener el primero, eliminar el resto
        const toDelete = products.slice(1)
        idsToDelete.push(...toDelete.map((p) => p.id))

        console.log(
          `[v0] SKU duplicado: ${products[0].sku} (normalizado: ${normalizedSKU}) - ` +
            `Manteniendo 1, eliminando ${toDelete.length}`,
        )
      }
    })

    console.log(`[v0] SKUs con duplicados encontrados: ${duplicateSkuCount}`)
    console.log(`[v0] Total de productos duplicados a eliminar: ${idsToDelete.length}`)

    if (idsToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: "No se encontraron duplicados para eliminar",
      })
    }

    // Paso 3: Eliminar en lotes
    console.log("[v0] Eliminando productos duplicados en lotes...")
    let deletedCount = 0
    const deleteBatchSize = 1000

    for (let i = 0; i < idsToDelete.length; i += deleteBatchSize) {
      const batch = idsToDelete.slice(i, i + deleteBatchSize)

      const { error: deleteError } = await supabase.from("products").delete().in("id", batch)

      if (deleteError) {
        console.error(`[v0] Error eliminando lote ${Math.floor(i / deleteBatchSize) + 1}:`, deleteError)
        throw deleteError
      }

      deletedCount += batch.length
      console.log(`[v0] Progreso: ${deletedCount}/${idsToDelete.length} productos eliminados`)
    }

    console.log("[v0] LIMPIEZA DE DUPLICADOS - COMPLETADA")
    console.log(`[v0] Total eliminado: ${deletedCount} productos`)

    return NextResponse.json({
      success: true,
      deletedCount,
      duplicateSkuCount,
      message: `Se eliminaron ${deletedCount} productos duplicados de ${duplicateSkuCount} SKUs, manteniendo los más antiguos`,
    })
  } catch (error: any) {
    console.error("[v0] ERROR en limpieza de duplicados:", error)
    console.error("[v0] Stack:", error.stack)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al limpiar duplicados",
      },
      { status: 500 },
    )
  }
}
