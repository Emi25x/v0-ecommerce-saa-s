import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"
import Papa from "papaparse"

export async function POST() {
  try {
    const supabase = await createClient()

    // Obtener primera cuenta de ML
    const { data: account } = await supabase.from("ml_accounts").select("*").limit(1).single()

    if (!account) {
      return NextResponse.json({ error: "No hay cuenta de ML" }, { status: 400 })
    }

    console.log("[v0] Procesando CSV completo para cuenta:", account.nickname)

    // Leer CSV desde el archivo
    const csvUrl =
      "https://blobs.vusercontent.net/blob/Publicaciones-2026_02_05-19_59%28Publicaciones%29-wUYvrnbsEQqOrzhs6clJDXGo1vSkv2.csv"
    const csvResponse = await fetch(csvUrl)
    const csvText = await csvResponse.text()

    // Parsear CSV
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
    const rows = parsed.data as any[]

    console.log("[v0] Total de filas en CSV:", rows.length)

    let processed = 0
    let inserted = 0
    let updated = 0
    let linked = 0
    let errors = 0

    // Procesar en lotes de 100
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)

      console.log(`[v0] Procesando lote ${i}-${i + batch.length}`)

      for (const row of batch) {
        try {
          const itemId = row.ITEM_ID
          const sku = row.SKU || row.SELLER_SKU
          const title = row.TITLE
          const quantity = parseInt(row.QUANTITY || "0")

          if (!itemId) continue

          // Buscar producto por SKU
          let product_id = null
          if (sku) {
            const { data: product } = await supabase.from("products").select("id").eq("ean", sku).maybeSingle()

            if (product) {
              product_id = product.id
              linked++
            }
          }

          // Verificar si existe
          const { data: existing } = await supabase
            .from("ml_publications")
            .select("id")
            .eq("ml_item_id", itemId)
            .maybeSingle()

          const pubData = {
            account_id: account.id,
            ml_item_id: itemId,
            product_id,
            title,
            current_stock: quantity,
            status: "active",
            updated_at: new Date().toISOString(),
          }

          if (existing) {
            // Actualizar
            await supabase.from("ml_publications").update(pubData).eq("id", existing.id)
            updated++
          } else {
            // Insertar
            await supabase.from("ml_publications").insert(pubData)
            inserted++
          }

          processed++
        } catch (error) {
          console.error("[v0] Error procesando fila:", error)
          errors++
        }
      }

      // Delay entre lotes para no sobrecargar
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    console.log(
      `[v0] Procesamiento completo: ${processed} procesadas, ${inserted} nuevas, ${updated} actualizadas, ${linked} vinculadas`,
    )

    return NextResponse.json({
      success: true,
      processed,
      inserted,
      updated,
      linked,
      errors,
    })
  } catch (error) {
    console.error("[v0] Error en import-all-csv:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 },
    )
  }
}
