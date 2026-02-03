import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Actualiza todas las publicaciones existentes en ML para agregar seller_sku con el EAN
// Esto permite que la sincronización de stock funcione correctamente
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { account_id, limit = 100, offset = 0 } = await request.json()

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
      const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL 
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` 
        : "http://localhost:3000"
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

    // Obtener items de ML con paginación
    const mlUserId = account.ml_user_id
    const searchResponse = await fetch(
      `https://api.mercadolibre.com/users/${mlUserId}/items/search?status=active&limit=${limit}&offset=${offset}`,
      {
        headers: { "Authorization": `Bearer ${accessToken}` }
      }
    )

    if (!searchResponse.ok) {
      return NextResponse.json({ error: "Error al obtener items de ML" }, { status: 500 })
    }

    const searchData = await searchResponse.json()
    const itemIds = searchData.results || []
    const total = searchData.paging?.total || 0

    if (itemIds.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No hay más publicaciones para procesar",
        updated: 0,
        total,
        offset,
        hasMore: false
      })
    }

    // Obtener todos los productos de la DB con EAN
    const { data: products } = await supabase
      .from("products")
      .select("id, ean, sku, title")
      .not("ean", "is", null)

    // Crear mapa de EAN -> producto
    const eanMap = new Map<string, { ean: string; sku: string | null }>()
    for (const p of products || []) {
      if (p.ean) {
        eanMap.set(p.ean, { ean: p.ean, sku: p.sku })
      }
    }

    let updated = 0
    let skipped = 0
    let errors = 0
    let noMatch = 0
    const results: Array<{ ml_item_id: string; status: string; ean?: string; error?: string }> = []

    // Procesar items en lotes de 20
    for (let i = 0; i < itemIds.length; i += 20) {
      const batch = itemIds.slice(i, i + 20)
      const idsParam = batch.join(",")
      
      const detailsResponse = await fetch(
        `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,seller_sku,attributes`,
        {
          headers: { "Authorization": `Bearer ${accessToken}` }
        }
      )

      if (!detailsResponse.ok) {
        console.error("[v0] Error obteniendo detalles:", await detailsResponse.text())
        continue
      }

      const itemsDetails = await detailsResponse.json()

      for (const itemWrapper of itemsDetails) {
        if (itemWrapper.code !== 200 || !itemWrapper.body) continue
        
        const item = itemWrapper.body

        // Si ya tiene seller_sku, saltar
        if (item.seller_sku) {
          skipped++
          results.push({ 
            ml_item_id: item.id, 
            status: "skipped", 
            ean: item.seller_sku 
          })
          continue
        }

        // Buscar EAN en atributos del item (GTIN, ISBN, etc)
        let ean: string | null = null
        if (item.attributes) {
          for (const attr of item.attributes) {
            if (["GTIN", "EAN", "ISBN", "UPC"].includes(attr.id) && attr.value_name) {
              ean = attr.value_name
              break
            }
          }
        }

        if (!ean) {
          noMatch++
          results.push({ 
            ml_item_id: item.id, 
            status: "no_ean",
            error: "No tiene GTIN/EAN en atributos"
          })
          continue
        }

        // Verificar que el EAN existe en nuestra DB
        if (!eanMap.has(ean)) {
          noMatch++
          results.push({ 
            ml_item_id: item.id, 
            ean,
            status: "no_match",
            error: `EAN ${ean} no encontrado en DB`
          })
          continue
        }

        // Actualizar el item en ML con seller_sku
        try {
          const updateResponse = await fetch(`https://api.mercadolibre.com/items/${item.id}`, {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              seller_sku: ean
            })
          })

          if (updateResponse.ok) {
            updated++
            results.push({ 
              ml_item_id: item.id, 
              ean,
              status: "updated"
            })
          } else {
            const errorData = await updateResponse.json()
            errors++
            results.push({ 
              ml_item_id: item.id, 
              ean,
              status: "error",
              error: errorData.message || JSON.stringify(errorData)
            })
          }

          // Delay para no saturar API
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
      await new Promise(resolve => setTimeout(resolve, 300))
    }

    const hasMore = offset + limit < total
    const nextOffset = offset + limit

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      errors,
      noMatch,
      processed: itemIds.length,
      total,
      offset,
      nextOffset: hasMore ? nextOffset : null,
      hasMore,
      message: `Procesados ${itemIds.length} de ${total}. Actualizados: ${updated}, Ya tenían SKU: ${skipped}, Sin match: ${noMatch}, Errores: ${errors}`,
      results: results.slice(0, 50)
    })

  } catch (error) {
    console.error("[v0] Error en fix-seller-sku:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error interno" 
    }, { status: 500 })
  }
}

// GET para ver estadísticas de cuántos items tienen/no tienen seller_sku
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const account_id = searchParams.get("account_id")

    if (!account_id) {
      return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    let accessToken = account.access_token
    if (new Date(account.token_expires_at) <= new Date()) {
      return NextResponse.json({ error: "Token expirado, usa POST para refrescar" }, { status: 401 })
    }

    // Obtener total de items
    const searchResponse = await fetch(
      `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active&limit=1`,
      {
        headers: { "Authorization": `Bearer ${accessToken}` }
      }
    )

    if (!searchResponse.ok) {
      return NextResponse.json({ error: "Error al obtener items" }, { status: 500 })
    }

    const searchData = await searchResponse.json()
    const total = searchData.paging?.total || 0

    return NextResponse.json({
      total,
      message: `Hay ${total} publicaciones activas. Usa POST con offset para actualizar en lotes.`,
      example: {
        method: "POST",
        body: { account_id, limit: 100, offset: 0 }
      }
    })

  } catch (error) {
    console.error("[v0] Error:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error interno" 
    }, { status: 500 })
  }
}
