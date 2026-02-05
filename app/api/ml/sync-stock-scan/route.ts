import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  console.log("[v0] ========== SYNC-STOCK-SCAN POST ==========")
  
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { account_id, scroll_id = null } = body
    
    console.log("[v0] account_id:", account_id, "scroll_id:", scroll_id ? "presente" : "inicial")

    if (!account_id) {
      return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
    }

    // Obtener cuenta
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      console.error("[v0] Error obteniendo cuenta:", accountError)
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    console.log("[v0] Cuenta encontrada:", account.nickname)

    // Construir URL con search_type=scan
    let searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?search_type=scan&limit=100`
    
    if (scroll_id) {
      searchUrl += `&scroll_id=${scroll_id}`
    }

    console.log("[v0] Fetching desde ML:", searchUrl)

    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    })

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error("[v0] Error ML API:", searchResponse.status, errorText)
      return NextResponse.json({ error: "Error consultando ML" }, { status: searchResponse.status })
    }

    const searchData = await searchResponse.json()
    const itemIds = searchData.results || []
    const nextScrollId = searchData.scroll_id || null

    console.log("[v0] Recibidos", itemIds.length, "items. Next scroll_id:", nextScrollId ? "presente" : "null")

    if (itemIds.length === 0) {
      console.log("[v0] No hay más items")
      return NextResponse.json({
        success: true,
        processed: 0,
        has_more: false,
        scroll_id: null,
        message: "Sincronización completa"
      })
    }

    // Obtener detalles de items en chunks
    const chunkSize = 20
    const chunks: string[][] = []
    for (let i = 0; i < itemIds.length; i += chunkSize) {
      chunks.push(itemIds.slice(i, i + chunkSize))
    }

    let processed = 0
    let linked = 0
    let errors = 0

    for (const chunk of chunks) {
      const itemsUrl = `https://api.mercadolibre.com/items?ids=${chunk.join(",")}&attributes=id,title,price,available_quantity,status,permalink,attributes`
      
      const itemsResponse = await fetch(itemsUrl, {
        headers: { Authorization: `Bearer ${account.access_token}` }
      })

      if (!itemsResponse.ok) {
        console.error("[v0] Error fetching chunk:", itemsResponse.status)
        errors += chunk.length
        continue
      }

      const itemsData = await itemsResponse.json()
      
      for (const itemWrapper of itemsData) {
        const item = itemWrapper.body
        if (!item) continue

        try {
          // Buscar EAN/ISBN/GTIN
          let sku = null
          let gtin = null

          if (item.attributes) {
            const skuAttr = item.attributes.find((attr: any) => attr.id === 'SELLER_SKU')
            const gtinAttr = item.attributes.find((attr: any) => attr.id === 'GTIN' || attr.id === 'ISBN')
            
            sku = skuAttr?.value_name || null
            gtin = gtinAttr?.value_name || null
          }

          // Vincular con producto por SKU o GTIN
          let product = null
          if (sku) {
            const { data } = await supabase
              .from("products")
              .select("id")
              .eq("sku", sku)
              .maybeSingle()
            product = data
          }

          if (!product && gtin) {
            const { data } = await supabase
              .from("products")
              .select("id")
              .eq("ean", gtin)
              .maybeSingle()
            product = data
          }

          // Verificar si ya existe la publicación
          const { data: existingPub } = await supabase
            .from("ml_publications")
            .select("id")
            .eq("ml_item_id", item.id)
            .maybeSingle()

          const publicationData = {
            account_id: account.id,
            ml_item_id: item.id,
            product_id: product?.id || null,
            title: item.title,
            price: item.price,
            current_stock: item.available_quantity,
            status: item.status,
            permalink: item.permalink,
            updated_at: new Date().toISOString()
          }

          if (existingPub) {
            await supabase
              .from("ml_publications")
              .update(publicationData)
              .eq("id", existingPub.id)
          } else {
            await supabase
              .from("ml_publications")
              .insert(publicationData)
          }

          processed++
          if (product) linked++

        } catch (itemError) {
          console.error("[v0] Error procesando item:", item.id, itemError)
          errors++
        }
      }
    }

    console.log("[v0] Procesados:", processed, "Vinculados:", linked, "Errores:", errors)

    // Si hay más items, auto-continuar
    const hasMore = !!nextScrollId
    if (hasMore) {
      console.log("[v0] Hay más items, auto-continuando...")
      const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL 
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` 
        : "http://localhost:3000"
      
      // Disparar siguiente batch sin esperar
      fetch(`${baseUrl}/api/ml/sync-stock-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          account_id,
          scroll_id: nextScrollId
        })
      }).catch(e => console.error("[v0] Error auto-continue:", e))
    }

    return NextResponse.json({
      success: true,
      processed,
      linked,
      errors,
      has_more: hasMore,
      scroll_id: nextScrollId,
      message: hasMore ? "Procesando en segundo plano..." : "Sincronización completa"
    })

  } catch (error) {
    console.error("[v0] Error en sync-stock-scan:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}
