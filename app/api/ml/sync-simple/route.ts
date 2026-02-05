import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  console.log("[v0] === SYNC SIMPLE INICIADO ===")
  
  try {
    const { account_id, limit = 50, offset = 0 } = await request.json()
    
    const supabase = await createClient()
    
    // Obtener cuenta
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()
      
    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }
    
    console.log(`[v0] Sincronizando ${account.nickname} - offset: ${offset}, limit: ${limit}`)
    
    // Traer items de ML
    const itemsUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?limit=${limit}&offset=${offset}`
    const itemsResponse = await fetch(itemsUrl, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    })
    
    if (!itemsResponse.ok) {
      const errorText = await itemsResponse.text()
      console.error("[v0] Error ML API:", itemsResponse.status, errorText.substring(0, 200))
      
      if (itemsResponse.status === 429) {
        return NextResponse.json({
          error: "Rate limit alcanzado",
          message: "Esperá 5 minutos y volvé a intentar",
          processed: 0,
          has_more: true,
          next_offset: offset
        }, { status: 429 })
      }
      
      throw new Error(`Error ML API: ${itemsResponse.status}`)
    }
    
    const itemsData = await itemsResponse.json()
    const itemIds = itemsData.results || []
    const totalInML = itemsData.paging?.total || 0
    
    console.log(`[v0] Obtenidos ${itemIds.length} IDs de ${totalInML} totales`)
    
    let processed = 0
    let linked = 0
    let errors = 0
    
    // Procesar de a 20 items con delay
    for (let i = 0; i < itemIds.length; i += 20) {
      const chunk = itemIds.slice(i, i + 20)
      
      try {
        // Obtener detalles de chunk
        const detailsUrl = `https://api.mercadolibre.com/items?ids=${chunk.join(",")}`
        const detailsResponse = await fetch(detailsUrl, {
          headers: { Authorization: `Bearer ${account.access_token}` }
        })
        
        if (!detailsResponse.ok) {
          console.error(`[v0] Error obteniendo chunk ${i}:`, detailsResponse.status)
          errors += chunk.length
          continue
        }
        
        const detailsData = await detailsResponse.json()
        
        // Procesar cada item
        for (const itemWrapper of detailsData) {
          const item = itemWrapper.body
          if (!item) continue
          
          try {
            // Buscar EAN/SKU
            let ean = item.seller_custom_field || ""
            if (!ean && item.attributes) {
              const isbnAttr = item.attributes.find((a: any) => 
                a.id === "ISBN" || a.id === "GTIN" || a.id === "EAN"
              )
              if (isbnAttr) ean = isbnAttr.value_name || ""
            }
            
            // Buscar producto en DB por EAN
            let product_id = null
            if (ean) {
              const { data: product } = await supabase
                .from("products")
                .select("id")
                .eq("ean", ean)
                .maybeSingle()
              
              if (product) {
                product_id = product.id
                linked++
              }
            }
            
            // Verificar si ya existe la publicación
            const { data: existing } = await supabase
              .from("ml_publications")
              .select("id")
              .eq("ml_item_id", item.id)
              .maybeSingle()
            
            const publicationData = {
              account_id: account.id,
              ml_item_id: item.id,
              product_id,
              title: item.title,
              price: item.price,
              current_stock: item.available_quantity,
              status: item.status,
              permalink: item.permalink,
              updated_at: new Date().toISOString()
            }
            
            if (existing) {
              // Actualizar
              await supabase
                .from("ml_publications")
                .update(publicationData)
                .eq("id", existing.id)
            } else {
              // Insertar
              await supabase
                .from("ml_publications")
                .insert(publicationData)
            }
            
            processed++
            
          } catch (itemError) {
            console.error(`[v0] Error procesando item ${item.id}:`, itemError)
            errors++
          }
        }
        
        // Delay de 1 segundo entre chunks
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (chunkError) {
        console.error(`[v0] Error procesando chunk:`, chunkError)
        errors += chunk.length
      }
    }
    
    const hasMore = offset + limit < totalInML
    const nextOffset = offset + limit
    
    console.log(`[v0] Finalizado: ${processed} procesados, ${linked} vinculados, ${errors} errores`)
    
    return NextResponse.json({
      success: true,
      processed,
      linked,
      errors,
      total_in_ml: totalInML,
      has_more: hasMore,
      next_offset: nextOffset,
      progress: `${offset + processed}/${totalInML}`
    })
    
  } catch (error) {
    console.error("[v0] Error en sync-simple:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error desconocido" 
    }, { status: 500 })
  }
}
