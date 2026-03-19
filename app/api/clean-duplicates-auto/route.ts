import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300

export async function POST() {
  try {
    console.log("[v0] 🧹 INICIANDO LIMPIEZA DE DUPLICADOS...")

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

    console.log(`[v0] ✅ Total productos obtenidos: ${allProducts.length}`)

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

    console.log(`[v0] 📊 SKUs únicos encontrados: ${skuGroups.size}`)

    const idsToDelete: string[] = []
    let duplicateSkuCount = 0

    skuGroups.forEach((group) => {
      if (group.length > 1) {
        duplicateSkuCount++
        // Ordenar por fecha (más antiguo primero)
        group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        // Mantener el primero (más antiguo), eliminar el resto
        const toDelete = group.slice(1).map((p) => p.id)
        idsToDelete.push(...toDelete)
        console.log(`[v0] 🔍 SKU "${group[0].sku}": ${group.length} copias, eliminando ${toDelete.length}`)
      }
    })

    console.log(`[v0] 🎯 Total SKUs duplicados: ${duplicateSkuCount}`)
    console.log(`[v0] 🗑️ Total productos a eliminar: ${idsToDelete.length}`)

    if (idsToDelete.length === 0) {
      console.log("[v0] ✅ No se encontraron duplicados")
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        duplicateSkuCount: 0,
        message: "No se encontraron duplicados",
      })
    }

    let deleted = 0
    const deleteBatchSize = 500

    for (let i = 0; i < idsToDelete.length; i += deleteBatchSize) {
      const batch = idsToDelete.slice(i, i + deleteBatchSize)
      console.log(
        `[v0] 🗑️ Eliminando lote ${Math.floor(i / deleteBatchSize) + 1} de ${Math.ceil(idsToDelete.length / deleteBatchSize)} (${batch.length} productos)...`,
      )

      const { error: deleteError } = await supabase.from("products").delete().in("id", batch)

      if (deleteError) {
        console.error(`[v0] ❌ Error eliminando lote:`, deleteError)
        throw deleteError
      }

      deleted += batch.length
      console.log(
        `[v0] ✅ Progreso: ${deleted}/${idsToDelete.length} eliminados (${Math.round((deleted / idsToDelete.length) * 100)}%)`,
      )
    }

    console.log(`[v0] ✅ LIMPIEZA COMPLETADA: ${deleted} productos eliminados de ${duplicateSkuCount} SKUs duplicados`)

    return NextResponse.json({
      success: true,
      deletedCount: deleted,
      duplicateSkuCount,
      message: `Se eliminaron ${deleted} productos duplicados de ${duplicateSkuCount} SKUs duplicados`,
    })
  } catch (error: any) {
    console.error("[v0] ❌ ERROR CRÍTICO:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: error.toString(),
      },
      { status: 500 },
    )
  }
}
