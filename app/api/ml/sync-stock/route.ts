import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Extrae el EAN/GTIN/SKU de un item de ML
// En ML el SKU del vendedor (seller_sku) suele ser el EAN
function extractEanFromItem(item: any): { ean: string | null; source: string } {
  // 1. Primero buscar en seller_sku (SKU del vendedor - normalmente es el EAN)
  if (item.seller_sku) {
    console.log(`[v0] Item ${item.id}: Found seller_sku = ${item.seller_sku}`)
    return { ean: item.seller_sku, source: "seller_sku" }
  }
  
  // 2. Buscar en seller_custom_field
  if (item.seller_custom_field) {
    console.log(`[v0] Item ${item.id}: Found seller_custom_field = ${item.seller_custom_field}`)
    return { ean: item.seller_custom_field, source: "seller_custom_field" }
  }
  
  // 3. Buscar en atributos GTIN/EAN/UPC/ISBN
  if (item.attributes) {
    const eanAttributes = ["GTIN", "EAN", "UPC", "ISBN", "SELLER_SKU"]
    for (const attr of item.attributes) {
      if (eanAttributes.includes(attr.id) && attr.value_name) {
        console.log(`[v0] Item ${item.id}: Found ${attr.id} = ${attr.value_name}`)
        return { ean: attr.value_name, source: attr.id }
      }
    }
  }
  
  console.log(`[v0] Item ${item.id}: NO EAN found. Attributes:`, JSON.stringify(item.attributes?.slice(0, 5)))
  return { ean: null, source: "none" }
}

// Sincroniza el stock de productos publicados en ML con el stock actual de la BD
// Relaciona por EAN: obtiene EAN de ML, busca producto en DB por EAN, actualiza stock en ML
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { account_id } = await request.json()

    if (!account_id) {
      return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
    }

    // Obtener cuenta ML y verificar token
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
      const refreshResponse = await fetch(`${process.env.NEXT_PUBLIC_VERCEL_URL || ""}/api/mercadolibre/refresh-token`, {
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

    // Obtener items activos de ML directamente desde la API
    const mlUserId = account.ml_user_id
    const itemsResponse = await fetch(
      `https://api.mercadolibre.com/users/${mlUserId}/items/search?status=active&limit=100`,
      {
        headers: { "Authorization": `Bearer ${accessToken}` }
      }
    )

    if (!itemsResponse.ok) {
      return NextResponse.json({ error: "Error al obtener items de ML" }, { status: 500 })
    }

    const itemsData = await itemsResponse.json()
    const itemIds = itemsData.results || []

    if (itemIds.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No hay publicaciones activas en ML",
        updated: 0 
      })
    }

    // Obtener todos los productos de nuestra DB con EAN
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, ean, sku, stock, title")
      .not("ean", "is", null)

    if (productsError) {
      return NextResponse.json({ error: "Error al obtener productos de DB" }, { status: 500 })
    }

    // Crear mapa de EAN -> stock
    const eanStockMap = new Map<string, { stock: number; title: string; id: string }>()
    for (const product of products || []) {
      if (product.ean) {
        eanStockMap.set(product.ean, { 
          stock: product.stock || 0, 
          title: product.title || "",
          id: product.id 
        })
      }
      // También mapear por SKU como fallback
      if (product.sku) {
        eanStockMap.set(product.sku, { 
          stock: product.stock || 0, 
          title: product.title || "",
          id: product.id 
        })
      }
    }

    // Procesar items en lotes de 20 para no saturar la API
    let updated = 0
    let errors = 0
    let noMatch = 0
    const results: Array<{ ml_item_id: string; ean?: string; status: string; error?: string; newStock?: number }> = []

    // Obtener detalles de items en lotes de 20
    for (let i = 0; i < itemIds.length; i += 20) {
      const batch = itemIds.slice(i, i + 20)
      const idsParam = batch.join(",")
      
      const detailsResponse = await fetch(
        `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,available_quantity,attributes,seller_custom_field,seller_sku`,
        {
          headers: { "Authorization": `Bearer ${accessToken}` }
        }
      )

      if (!detailsResponse.ok) {
        console.error("Error obteniendo detalles de items:", await detailsResponse.text())
        continue
      }

      const itemsDetails = await detailsResponse.json()

      for (const itemWrapper of itemsDetails) {
        if (itemWrapper.code !== 200 || !itemWrapper.body) continue
        
        const item = itemWrapper.body
        const { ean, source } = extractEanFromItem(item)

        if (!ean) {
          noMatch++
          results.push({ 
            ml_item_id: item.id, 
            status: "no_ean", 
            error: "No se encontró EAN en la publicación" 
          })
          continue
        }

        const productInfo = eanStockMap.get(ean)
        if (!productInfo) {
          noMatch++
          results.push({ 
            ml_item_id: item.id, 
            ean,
            status: "no_match", 
            error: `No se encontró producto con EAN ${ean} en DB` 
          })
          continue
        }

        const newStock = productInfo.stock
        const currentStock = item.available_quantity || 0

        // Solo actualizar si el stock es diferente
        if (newStock === currentStock) {
          results.push({ 
            ml_item_id: item.id, 
            ean,
            status: "unchanged",
            newStock 
          })
          continue
        }

        try {
          // Actualizar stock en ML
          const updateResponse = await fetch(`https://api.mercadolibre.com/items/${item.id}`, {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              available_quantity: newStock
            })
          })

          if (updateResponse.ok) {
            updated++
console.log(`[v0] Item ${item.id}: UPDATED stock from ${currentStock} to ${newStock} (EAN: ${ean} via ${source})`)
            results.push({ 
            ml_item_id: item.id, 
            ean,
            status: "updated",
            newStock 
          })
            
            // Actualizar o crear registro en ml_publications
            const { data: existingPub } = await supabase
              .from("ml_publications")
              .select("id")
              .eq("ml_item_id", item.id)
              .single()

            if (existingPub) {
              await supabase
                .from("ml_publications")
                .update({ 
                  current_stock: newStock,
                  updated_at: new Date().toISOString()
                })
                .eq("id", existingPub.id)
            }
          } else {
            const errorData = await updateResponse.json()
            errors++
            results.push({ 
              ml_item_id: item.id, 
              ean,
              status: "error", 
              error: errorData.message || "Error al actualizar ML" 
            })
          }

          // Delay para no saturar la API
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (err) {
          errors++
          results.push({ 
            ml_item_id: item.id, 
            ean,
            status: "error", 
            error: "Error de conexión" 
          })
        }
      }

      // Delay entre lotes
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Actualizar estadísticas de la cuenta
    await supabase
      .from("ml_accounts")
      .update({
        updated_at: new Date().toISOString()
      })
      .eq("id", account_id)

    return NextResponse.json({
      success: true,
      updated,
      errors,
      noMatch,
      total: itemIds.length,
      message: `Sincronizado: ${updated} actualizados, ${errors} errores, ${noMatch} sin match por EAN`,
      results: results.slice(0, 50) // Limitar resultados en respuesta
    })

  } catch (error) {
    console.error("Error en sync-stock:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error interno" 
    }, { status: 500 })
  }
}

// GET para ejecutar sync de todas las cuentas con auto_sync_stock habilitado
export async function GET() {
  try {
    const supabase = await createClient()

    // Obtener todas las cuentas con sync automático habilitado
    const { data: accounts, error } = await supabase
      .from("ml_accounts")
      .select("id, nickname")
      .eq("auto_sync_stock", true)

    if (error || !accounts) {
      return NextResponse.json({ error: "Error al obtener cuentas" }, { status: 500 })
    }

    const results = []
    for (const account of accounts) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_VERCEL_URL || ""}/api/ml/sync-stock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: account.id })
        })
        const data = await response.json()
        results.push({
          account: account.nickname,
          ...data
        })
      } catch (err) {
        results.push({
          account: account.nickname,
          error: "Error al sincronizar"
        })
      }
    }

    return NextResponse.json({
      success: true,
      accounts_processed: accounts.length,
      results
    })

  } catch (error) {
    console.error("Error en sync-stock GET:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error interno" 
    }, { status: 500 })
  }
}
