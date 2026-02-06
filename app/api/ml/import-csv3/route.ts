import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST() {
  try {
    console.log("[v0] Iniciando importación CSV3")
    const supabase = await createClient()
    
    // Obtener cuenta LIBROESVIDA
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("nickname", "LIBROESVIDA")
      .single()
    
    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }
    
    console.log("[v0] Procesando CSV3 completo para cuenta:", account.nickname)
    
    // Descargar CSV3 desde blob
    const csvUrl = "https://blobs.vusercontent.net/blob/Publicaciones-2026_02_06-07_36%28Publicaciones%29-J2RzlCNv0FhS5fADIiOg2f7LR822rh.csv"
    const csvResponse = await fetch(csvUrl)
    const csvText = await csvResponse.text()
    
    // Parsear CSV separado por ";"
    const lines = csvText.split("\n").filter(line => line.trim())
    console.log("[v0] Total de filas en CSV3:", lines.length)
    
    let processed = 0
    let inserted = 0
    let updated = 0
    let linked = 0
    let errors = 0
    
    // Procesar en batches de 100
    const batchSize = 100
    for (let i = 0; i < lines.length; i += batchSize) {
      const batch = lines.slice(i, i + batchSize)
      
      for (const line of batch) {
        try {
          // Saltar headers y líneas vacías
          if (line.includes("FAMILY_ID") || line.includes("Publicaciones") || line.includes("Agrupador")) {
            continue
          }
          
          const columns = line.split(";")
          if (columns.length < 6) continue
          
          const itemId = columns[1]?.trim()
          const sku = columns[4]?.trim()
          const title = columns[5]?.trim()
          
          if (!itemId || !title) continue
          
          processed++
          
          // Buscar producto por SKU
          let productId = null
          if (sku) {
            const { data: productMatch } = await supabase
              .from("products")
              .select("id")
              .eq("ean", sku)
              .maybeSingle()
            
            if (productMatch) {
              productId = productMatch.id
              linked++
            }
          }
          
          // Verificar si existe la publicación
          const { data: existing } = await supabase
            .from("ml_publications")
            .select("id")
            .eq("ml_item_id", itemId)
            .maybeSingle()
          
          const publicationData = {
            account_id: account.id,
            ml_item_id: itemId,
            product_id: productId,
            title: title,
            status: "active",
            updated_at: new Date().toISOString()
          }
          
          if (existing) {
            await supabase
              .from("ml_publications")
              .update(publicationData)
              .eq("id", existing.id)
            updated++
          } else {
            await supabase
              .from("ml_publications")
              .insert(publicationData)
            inserted++
          }
          
        } catch (err) {
          console.error("[v0] Error procesando línea CSV3:", err)
          errors++
        }
      }
      
      // Log progreso cada batch
      if (i % 500 === 0) {
        console.log(`[v0] CSV3 progreso: ${processed} procesadas, ${inserted} nuevas, ${updated} actualizadas, ${linked} vinculadas`)
      }
    }
    
    console.log("[v0] CSV3 completado:", { processed, inserted, updated, linked, errors })
    
    return NextResponse.json({
      success: true,
      processed,
      inserted,
      updated,
      linked,
      errors
    })
    
  } catch (error) {
    console.error("[v0] Error en import-csv3:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    )
  }
}
