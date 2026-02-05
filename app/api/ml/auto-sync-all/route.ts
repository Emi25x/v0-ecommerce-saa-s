import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { offset = 0, accountId } = await request.json()

    console.log(`[v0] Auto-sync iniciado - offset: ${offset}`)

    // Obtener cuenta
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", accountId)
      .single()

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    // Obtener items de ML (solo activos, de a 50)
    const mlUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active&limit=50&offset=${offset}`
    const mlResponse = await fetch(mlUrl, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    })

    if (!mlResponse.ok) {
      console.error("[v0] Error en ML API:", await mlResponse.text())
      return NextResponse.json({ error: "Error en ML API", rate_limited: mlResponse.status === 429 }, { status: mlResponse.status })
    }

    const mlData = await mlResponse.json()
    const itemIds = mlData.results || []
    
    console.log(`[v0] Procesando ${itemIds.length} items (offset ${offset})`)

    let processed = 0
    let linked = 0
    let errors = 0

    // Procesar cada item
    for (const itemId of itemIds) {
      try {
        // Obtener detalles del item
        const itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
          headers: { Authorization: `Bearer ${account.access_token}` }
        })

        if (!itemResponse.ok) continue

        const item = await itemResponse.json()
        
        // Buscar SKU o GTIN
        let sku = item.seller_custom_field || ""
        let gtin = ""
        
        if (item.attributes) {
          const gtinAttr = item.attributes.find((a: any) => a.id === "GTIN" || a.id === "ISBN" || a.id === "EAN")
          if (gtinAttr) gtin = gtinAttr.value_name || ""
        }

        // Buscar producto por SKU primero, luego GTIN
        let product = null
        if (sku) {
          const { data } = await supabase.from("products").select("id").eq("sku", sku).maybeSingle()
          product = data
        }
        
        if (!product && gtin) {
          const { data } = await supabase.from("products").select("id").eq("ean", gtin).maybeSingle()
          product = data
        }

        // Verificar si ya existe
        const { data: existing } = await supabase
          .from("ml_publications")
          .select("id")
          .eq("ml_item_id", itemId)
          .maybeSingle()

        const publicationData = {
          account_id: account.id,
          ml_item_id: itemId,
          product_id: product?.id || null,
          title: item.title,
          price: item.price,
          available_quantity: item.available_quantity,
          sold_quantity: item.sold_quantity,
          status: item.status,
          permalink: item.permalink,
          thumbnail: item.thumbnail,
          ean: gtin || sku,
          updated_at: new Date().toISOString()
        }

        if (existing) {
          await supabase.from("ml_publications").update(publicationData).eq("id", existing.id)
        } else {
          await supabase.from("ml_publications").insert({ ...publicationData, created_at: new Date().toISOString() })
        }

        if (product) linked++
        processed++
      } catch (error) {
        console.error(`[v0] Error procesando item ${itemId}:`, error)
        errors++
      }
    }

    const hasMore = mlData.paging.total > offset + itemIds.length
    const newOffset = offset + itemIds.length
    const progress = Math.round((newOffset / mlData.paging.total) * 100)

    console.log(`[v0] Lote completado: ${processed} procesados, ${linked} vinculados, ${errors} errores`)
    console.log(`[v0] Progreso: ${progress}% (${newOffset}/${mlData.paging.total})`)

    // Actualizar estadísticas de cuenta
    await supabase
      .from("ml_accounts")
      .update({
        last_stock_sync_at: new Date().toISOString(),
        total_ml_publications: mlData.paging.total
      })
      .eq("id", account.id)

    // Si hay más, auto-reinvocar
    if (hasMore && itemIds.length > 0) {
      console.log(`[v0] Continuando sincronización... siguiente offset: ${newOffset}`)
      
      // Esperar 1 segundo para no saturar API
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Auto-invocar siguiente lote
      const nextBatch = await fetch(`${process.env.NEXT_PUBLIC_VERCEL_URL || 'http://localhost:3000'}/api/ml/auto-sync-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset: newOffset, accountId })
      })

      return NextResponse.json({
        success: true,
        processed,
        linked,
        errors,
        progress,
        total: mlData.paging.total,
        continuing: true
      })
    }

    // Completado
    console.log(`[v0] ✓ Sincronización COMPLETADA - Total: ${mlData.paging.total} items`)
    
    return NextResponse.json({
      success: true,
      processed,
      linked,
      errors,
      progress: 100,
      total: mlData.paging.total,
      completed: true
    })

  } catch (error) {
    console.error("[v0] Error fatal en auto-sync:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error desconocido",
      fatal: true
    }, { status: 500 })
  }
}
