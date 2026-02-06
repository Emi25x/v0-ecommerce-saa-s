import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { csvData, account_id } = await request.json()
    
    if (!account_id) {
      return NextResponse.json({ error: "account_id es requerido" }, { status: 400 })
    }
    
    console.log("[v0] Procesando CSV con", csvData.length, "filas para cuenta:", account_id)
    
    let processed = 0
    let linked = 0
    let notLinked = 0
    let errors = 0
    
    // Obtener cuenta específica
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()
    
    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }
    
    // Procesar en batches de 50
    for (let i = 0; i < csvData.length; i += 50) {
      const batch = csvData.slice(i, i + 50)
      
      for (const row of batch) {
        try {
          const itemId = row.ITEM_ID
          const sku = row.SKU
          const title = row.TITLE
          const quantity = parseInt(row.QUANTITY) || 0
          
          if (!itemId || itemId === 'ITEM_ID') continue // Skip header
          
          // Buscar producto por EAN
          let product_id = null
          if (sku && sku.trim() !== '') {
            const { data: product } = await supabase
              .from("products")
              .select("id")
              .eq("ean", sku.trim())
              .maybeSingle()
            
            if (product) {
              product_id = product.id
              linked++
            } else {
              notLinked++
            }
          } else {
            notLinked++
          }
          
          // Verificar si ya existe
          const { data: existing } = await supabase
            .from("ml_publications")
            .select("id")
            .eq("ml_item_id", itemId)
            .maybeSingle()
          
          const pubData = {
            account_id: account.id,
            ml_item_id: itemId,
            product_id,
            title: title || "",
            current_stock: quantity,
            status: "active",
            updated_at: new Date().toISOString()
          }
          
          if (existing) {
            await supabase
              .from("ml_publications")
              .update(pubData)
              .eq("id", existing.id)
          } else {
            await supabase
              .from("ml_publications")
              .insert(pubData)
          }
          
          processed++
          
        } catch (error) {
          console.error("[v0] Error procesando fila:", error)
          errors++
        }
      }
      
      console.log(`[v0] Progreso: ${processed}/${csvData.length}`)
      
      // Pequeño delay entre batches
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return NextResponse.json({
      success: true,
      processed,
      linked,
      notLinked,
      errors
    })
    
  } catch (error) {
    console.error("[v0] Error importando CSV:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error desconocido" 
    }, { status: 500 })
  }
}
