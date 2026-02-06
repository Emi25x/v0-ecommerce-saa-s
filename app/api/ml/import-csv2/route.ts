import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    const supabase = await createClient()
    
    // Obtener primera cuenta de ML
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .limit(1)
      .single()
    
    if (!account) {
      return NextResponse.json({ error: "No hay cuenta de ML" }, { status: 400 })
    }
    
    console.log("[v0] Procesando CSV2 completo para cuenta:", account.nickname)
    
    // Leer CSV2 desde el blob
    const csvUrl = "https://blobs.vusercontent.net/blob/Publicaciones-2026_02_06-07_25%28Publicaciones%29-eh4jNWqyavoKwvZXqd1PbDGHvrzfrf.csv"
    const csvResponse = await fetch(csvUrl)
    const csvText = await csvResponse.text()
    
    // Parsear CSV manualmente (formato con ; como separador)
    const lines = csvText.split('\n')
    const dataLines = lines.slice(5) // Saltar headers (primeras 5 líneas)
    
    console.log("[v0] Total de filas en CSV2:", dataLines.length)
    
    let processed = 0
    let inserted = 0
    let updated = 0
    let linked = 0
    let errors = 0
    
    // Procesar en lotes de 50
    for (let i = 0; i < dataLines.length; i += 50) {
      const batch = dataLines.slice(i, i + 50)
      
      for (const line of batch) {
        if (!line.trim()) continue
        
        const columns = line.split(';')
        if (columns.length < 7) continue
        
        const mlItemId = columns[1]?.trim()
        const sku = columns[4]?.trim()
        const title = columns[5]?.trim()
        
        if (!mlItemId || mlItemId === 'ITEM_ID') continue
        
        try {
          processed++
          
          // Buscar product_id por SKU
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
          
          // Verificar si existe
          const { data: existing } = await supabase
            .from("ml_publications")
            .select("id")
            .eq("ml_item_id", mlItemId)
            .maybeSingle()
          
          const pubData = {
            account_id: account.id,
            ml_item_id: mlItemId,
            product_id: productId,
            title: title || 'Sin título',
            current_stock: 0,
            status: 'active',
            updated_at: new Date().toISOString()
          }
          
          if (existing) {
            await supabase
              .from("ml_publications")
              .update(pubData)
              .eq("id", existing.id)
            updated++
          } else {
            await supabase
              .from("ml_publications")
              .insert(pubData)
            inserted++
          }
          
        } catch (error) {
          console.error(`[v0] Error procesando ${mlItemId}:`, error)
          errors++
        }
      }
      
      console.log(`[v0] Progreso: ${processed}/${dataLines.length} (${inserted} nuevas, ${updated} actualizadas, ${linked} vinculadas)`)
    }
    
    return NextResponse.json({
      success: true,
      processed,
      inserted,
      updated,
      linked,
      errors
    })
    
  } catch (error) {
    console.error("[v0] Error en import-csv2:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error desconocido" 
    }, { status: 500 })
  }
}
