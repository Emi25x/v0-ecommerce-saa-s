import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Importa todas las publicaciones existentes de ML a nuestra base de datos
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { account_id } = await request.json()

    if (!account_id) {
      return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
    }

    // Obtener cuenta ML
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    // Refrescar token si es necesario
    let accessToken = account.access_token
    if (new Date(account.token_expires_at) <= new Date()) {
      const requestUrl = new URL(request.url)
      const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`
      
      const refreshResponse = await fetch(`${baseUrl}/api/mercadolibre/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id })
      })
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json()
        accessToken = refreshData.access_token
      } else {
        return NextResponse.json({ error: "Error al refrescar token" }, { status: 401 })
      }
    }

    // Obtener todos los productos de nuestra DB para relacionar por EAN
    const { data: products } = await supabase
      .from("products")
      .select("id, ean, sku, title")
      .not("ean", "is", null)

    const eanToProductId = new Map<string, string>()
    for (const product of products || []) {
      if (product.ean) eanToProductId.set(product.ean, product.id)
      if (product.sku) eanToProductId.set(product.sku, product.id)
    }

    // Obtener todas las publicaciones de ML (paginado con scroll_id para > 1000 items)
    const mlUserId = account.ml_user_id
    let allItemIds: string[] = []
    let scrollId: string | null = null
    const limit = 100
    let hasMore = true

    while (hasMore) {
      // ML no permite offset > 1000, usar scroll_id para paginar más allá
      let searchUrl = `https://api.mercadolibre.com/users/${mlUserId}/items/search?status=active&limit=${limit}`
      
      if (scrollId) {
        searchUrl += `&scroll_id=${scrollId}`
      }

      const searchResponse = await fetch(
        searchUrl,
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      )

      if (!searchResponse.ok) {
        console.error("Error buscando items:", await searchResponse.text())
        break
      }

      const searchData = await searchResponse.json()
      const itemIds = searchData.results || []
      allItemIds = allItemIds.concat(itemIds)

      // Usar scroll_id para la siguiente página
      scrollId = searchData.scroll_id || null
      hasMore = itemIds.length === limit && scrollId !== null

      // Pequeño delay para no saturar
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`[v0] Encontradas ${allItemIds.length} publicaciones activas en ML`)

    if (allItemIds.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No hay publicaciones activas en ML",
        imported: 0 
      })
    }

    // Procesar items en lotes de 20
    let imported = 0
    let errors = 0
    let noMatch = 0

    for (let i = 0; i < allItemIds.length; i += 20) {
      const batch = allItemIds.slice(i, i + 20)
      const idsParam = batch.join(",")

      const detailsResponse = await fetch(
        `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,price,available_quantity,status,attributes,seller_sku,seller_custom_field,catalog_product_id,listing_type_id`,
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      )

      if (!detailsResponse.ok) {
        console.error("Error obteniendo detalles:", await detailsResponse.text())
        continue
      }

      const itemsDetails = await detailsResponse.json()

      for (const itemWrapper of itemsDetails) {
        if (itemWrapper.code !== 200 || !itemWrapper.body) continue

        const item = itemWrapper.body

        // Extraer EAN del item
        let ean: string | null = null
        
        // 1. seller_sku
        if (item.seller_sku) ean = item.seller_sku
        
        // 2. seller_custom_field
        if (!ean && item.seller_custom_field) ean = item.seller_custom_field
        
        // 3. Atributos GTIN/EAN
        if (!ean && item.attributes) {
          const eanAttrs = ["GTIN", "EAN", "UPC", "ISBN"]
          for (const attr of item.attributes) {
            if (eanAttrs.includes(attr.id) && attr.value_name) {
              ean = attr.value_name
              break
            }
          }
        }

        // Buscar producto en nuestra DB por EAN
        const productId = ean ? eanToProductId.get(ean) : null

        if (!productId) {
          noMatch++
          continue
        }

        // Verificar si ya existe en ml_publications
        const { data: existing } = await supabase
          .from("ml_publications")
          .select("id")
          .eq("ml_item_id", item.id)
          .single()

        if (existing) {
          // Ya existe, actualizar
          await supabase
            .from("ml_publications")
            .update({
              status: item.status,
              price: item.price,
              current_stock: item.available_quantity,
              updated_at: new Date().toISOString()
            })
            .eq("id", existing.id)
        } else {
          // Crear nuevo registro
          const { error: insertError } = await supabase
            .from("ml_publications")
            .insert({
              account_id: account_id,
              product_id: productId,
              ml_item_id: item.id,
              status: item.status || "active",
              price: item.price,
              current_stock: item.available_quantity,
              listing_type: item.listing_type_id,
              is_catalog: !!item.catalog_product_id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })

          if (insertError) {
            console.error(`Error insertando ${item.id}:`, insertError)
            errors++
          } else {
            imported++
          }
        }
      }

      // Delay entre lotes
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    return NextResponse.json({
      success: true,
      imported,
      errors,
      noMatch,
      total: allItemIds.length,
      message: `Importadas ${imported} publicaciones, ${noMatch} sin match por EAN, ${errors} errores`
    })

  } catch (error) {
    console.error("Error importando publicaciones:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error interno" 
    }, { status: 500 })
  }
}
