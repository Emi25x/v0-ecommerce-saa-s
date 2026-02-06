import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createClient()
    
    // CSV data del archivo que me enviaste
    const csvRaw = await fetch('https://blobs.vusercontent.net/blob/Publicaciones-2026_02_05-19_59%28Publicaciones%29-wUYvrnbsEQqOrzhs6clJDXGo1vSkv2.csv')
    const csvText = await csvRaw.text()
    
    // Obtener primera cuenta
    const { data: accounts } = await supabase.from("ml_accounts").select("*").limit(1)
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: "No hay cuentas" }, { status: 400 })
    }
    
    const account = accounts[0]
    console.log(`[v0] Procesando CSV para cuenta: ${account.nickname}`)
    
    // Parsear CSV
    const lines = csvText.trim().split('\n')
    const headers = lines[0].split(';')
    
    let processed = 0
    let linked = 0
    let errors = 0
    
    // Procesar de a 100 para no saturar
    for (let i = 1; i < Math.min(lines.length, 101); i++) {
      try {
        const values = lines[i].split(';')
        const row: any = {}
        headers.forEach((header, index) => {
          row[header] = values[index]?.trim() || ""
        })
        
        const itemId = row.ITEM_ID
        const sku = row.SKU
        
        if (!itemId) continue
        
        // Buscar producto por SKU
        let product_id = null
        if (sku) {
          const { data: product } = await supabase
            .from("products")
            .select("id")
            .eq("ean", sku)
            .maybeSingle()
          
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
          title: row.TITLE,
          price: parseFloat(row.PRICE) || 0,
          current_stock: parseInt(row.QUANTITY) || 0,
          status: row.STATUS,
          permalink: row.PERMALINK,
          updated_at: new Date().toISOString()
        }
        
        if (existing) {
          await supabase.from("ml_publications").update(pubData).eq("id", existing.id)
        } else {
          await supabase.from("ml_publications").insert(pubData)
        }
        
        processed++
      } catch (err) {
        console.error("[v0] Error procesando fila:", err)
        errors++
      }
    }
    
    return NextResponse.json({
      success: true,
      processed,
      linked,
      errors,
      message: `Procesadas primeras 100 filas: ${processed} guardadas, ${linked} vinculadas`
    })
    
  } catch (error) {
    console.error("[v0] Error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
