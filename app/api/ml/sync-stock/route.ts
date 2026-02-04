import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 300

// Sincroniza stock: extrae publicaciones de ML con su SKU, busca match en DB, actualiza stock
export async function POST(request: Request) {
  console.log("[v0] ========== SYNC-STOCK POST ==========")
  try {
    const supabase = await createClient()
    const body = await request.json()
    console.log("[v0] Request body:", JSON.stringify(body))
    const { account_id, limit = 50, offset = 0 } = body

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

    // PASO 1: Obtener lista de IDs de items activos de ML (1 llamada)
    const searchResponse = await fetch(
      `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active&limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    const searchText = await searchResponse.text()
    if (searchText.includes("Too Many") || searchResponse.status === 429) {
      return NextResponse.json({
        success: false,
        rate_limited: true,
        message: "Límite de API de ML alcanzado. Espera 1 hora."
      })
    }

    if (!searchResponse.ok) {
      return NextResponse.json({ error: "Error al obtener items de ML" }, { status: 500 })
    }

    const searchData = JSON.parse(searchText)
    const itemIds: string[] = searchData.results || []
    const totalInML = searchData.paging?.total || 0
    console.log("[v0] ML items encontrados:", itemIds.length, "Total en ML:", totalInML)

    if (itemIds.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No hay items para procesar",
        total_in_ml: totalInML 
      })
    }

    // Actualizar total de publicaciones en la cuenta
    await supabase.from("ml_accounts").update({ 
      total_ml_publications: totalInML 
    }).eq("id", account_id)

    let linked = 0
    let noEan = 0
    let noProductMatch = 0
    let errors = 0
    let updated = 0 // Declare the updated variable

    // PASO 2: Obtener detalles en batches de 20 (límite de ML)
    for (let i = 0; i < itemIds.length; i += 20) {
      const batchIds = itemIds.slice(i, i + 20)
      const idsParam = batchIds.join(",")

      const detailsResponse = await fetch(
        `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,seller_sku,seller_custom_field,available_quantity,status,price,permalink,attributes`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      const detailsText = await detailsResponse.text()
      if (detailsText.includes("Too Many") || detailsResponse.status === 429) {
        return NextResponse.json({
          success: true,
          rate_limited: true,
          message: "Rate limit alcanzado. Progreso guardado.",
          processed: i,
          updated,
          linked,
          no_ean: noEan,
          no_product_match: noProductMatch,
          errors,
          total_in_ml: totalInML
        })
      }

      if (!detailsResponse.ok) {
        errors += batchIds.length
        continue
      }

      const items = JSON.parse(detailsText)

      // PASO 3: Para cada item, extraer EAN y buscar match en nuestra DB
      for (const itemWrapper of items) {
        if (itemWrapper.code !== 200 || !itemWrapper.body) {
          errors++
          continue
        }

        const item = itemWrapper.body

        // Extraer EAN: seller_sku -> seller_custom_field -> atributo GTIN/EAN/ISBN
        let ean = item.seller_sku || item.seller_custom_field || null

        if (!ean && item.attributes) {
          for (const attr of item.attributes) {
            if (["GTIN", "EAN", "ISBN", "UPC"].includes(attr.id) && attr.value_name) {
              ean = attr.value_name
              break
            }
          }
        }

        if (!ean) {
          noEan++
          continue
        }

        // Buscar producto en nuestra DB por EAN
        const { data: product } = await supabase
          .from("products")
          .select("id, stock, title")
          .eq("ean", ean)
          .maybeSingle()

        if (!product) {
          noProductMatch++
          // Guardar publicación sin vincular (verificar si existe primero)
          try {
            const { data: existingUnlinked } = await supabase
              .from("ml_publications")
              .select("id")
              .eq("ml_item_id", item.id)
              .maybeSingle()
            
            if (existingUnlinked) {
              await supabase.from("ml_publications")
                .update({
                  title: item.title,
                  status: item.status,
                  price: item.price,
                  current_stock: item.available_quantity,
                  updated_at: new Date().toISOString()
                })
                .eq("id", existingUnlinked.id)
            } else {
              await supabase.from("ml_publications").insert({
                account_id: account.id,
                ml_item_id: item.id,
                title: item.title,
                status: item.status,
                price: item.price,
                current_stock: item.available_quantity,
                permalink: item.permalink
              })
            }
          } catch (e) {
            console.error("[v0] Error guardando publicación sin vincular:", e)
            errors++
          }
          continue
        }

        // PASO 4: Guardar/actualizar en ml_publications con vinculación
        try {
          const { data: existingPub } = await supabase
            .from("ml_publications")
            .select("id, product_id")
            .eq("ml_item_id", item.id)
            .maybeSingle()

          const updateData: Record<string, any> = {
            current_stock: item.available_quantity,
            updated_at: new Date().toISOString()
          }

          if (existingPub) {
            if (!existingPub.product_id) {
              // Vincular por primera vez
              updateData.product_id = product.id
              linked++
            }
            await supabase.from("ml_publications").update(updateData).eq("id", existingPub.id)
          } else {
            // Crear nueva entrada vinculada
            await supabase.from("ml_publications").insert({
              account_id: account.id,
              ml_item_id: item.id,
              product_id: product.id,
              title: item.title,
              status: item.status,
              price: item.price,
              current_stock: item.available_quantity,
              permalink: item.permalink
            })
            linked++
          }

          updated++ // Increment the updated variable
        } catch (e) {
          console.error("[v0] Error guardando publicación vinculada:", item.id, e)
          errors++
        }
      }

      // Delay entre batches
      await new Promise(resolve => setTimeout(resolve, 300))
    }

    // Actualizar estadísticas de la cuenta
    await supabase.from("ml_accounts").update({
      last_stock_sync_at: new Date().toISOString()
    }).eq("id", account_id)

    const result = {
      success: true,
      processed: itemIds.length,
      linked,
      no_ean: noEan,
      no_product_match: noProductMatch,
      errors,
      total_in_ml: totalInML,
      has_more: offset + limit < totalInML,
      next_offset: offset + limit
    }
    console.log("[v0] Sync-stock RESULTADO:", JSON.stringify(result))
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error en sync-stock:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 })
  }
}

// GET para cron automático
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: accounts } = await supabase
      .from("ml_accounts")
      .select("id, nickname")
      .eq("auto_sync_stock", true)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: "No hay cuentas con auto-sync habilitado" })
    }

    const results = []
    for (const account of accounts) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_VERCEL_URL || ""}/api/ml/sync-stock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: account.id, limit: 200 })
        })
        const data = await response.json()
        results.push({ account: account.nickname, ...data })
      } catch (err) {
        results.push({ account: account.nickname, error: "Error" })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
