import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 300

// Sincroniza el stock de ML con productos de nuestra DB por EAN
// Si una publicación se actualiza exitosamente, se marca como vinculada
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { account_id, limit = 100 } = await request.json()

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

    // Obtener lista de publicaciones activas de ML
    const searchResponse = await fetch(
      `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active&limit=${limit}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!searchResponse.ok) {
      if (searchResponse.status === 429) {
        return NextResponse.json({ error: "Rate limit de ML. Intenta más tarde.", rate_limited: true }, { status: 429 })
      }
      return NextResponse.json({ error: "Error al obtener items de ML" }, { status: 500 })
    }

    const searchData = await searchResponse.json()
    const totalInML = searchData.paging?.total || 0
    const itemIds = searchData.results || []

    // Actualizar total de publicaciones en la cuenta
    await supabase.from("ml_accounts").update({ total_ml_publications: totalInML }).eq("id", account_id)

    if (itemIds.length === 0) {
      return NextResponse.json({ success: true, message: "No hay publicaciones activas", updated: 0 })
    }

    let updated = 0
    let linked = 0
    let noStock = 0
    let noEan = 0
    let errors = 0

    // Procesar en lotes de 20 (límite de ML API multiget)
    for (let i = 0; i < itemIds.length; i += 20) {
      const batch = itemIds.slice(i, i + 20)
      const idsParam = batch.join(",")

      try {
        const detailsResponse = await fetch(
          `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,seller_sku,seller_custom_field,attributes,available_quantity`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )

        if (!detailsResponse.ok) {
          if (detailsResponse.status === 429) {
            // Rate limit, devolver lo que tenemos
            return NextResponse.json({
              success: true,
              rate_limited: true,
              message: "Rate limit alcanzado. Ejecuta de nuevo más tarde.",
              total_in_ml: totalInML,
              processed: i,
              updated,
              linked,
              no_stock: noStock,
              no_ean: noEan,
              errors
            })
          }
          errors += batch.length
          continue
        }

        const items = await detailsResponse.json()

        for (const itemWrapper of items) {
          if (itemWrapper.code !== 200 || !itemWrapper.body) {
            errors++
            continue
          }

          const item = itemWrapper.body

          // Extraer EAN: primero seller_sku, luego seller_custom_field, luego GTIN
          let ean = item.seller_sku || item.seller_custom_field || null

          if (!ean && item.attributes) {
            for (const attr of item.attributes) {
              if (["GTIN", "EAN", "ISBN"].includes(attr.id) && attr.value_name) {
                ean = attr.value_name
                break
              }
            }
          }

          if (!ean) {
            noEan++
            continue
          }

          // Buscar producto por EAN en nuestra DB
          const { data: product } = await supabase
            .from("products")
            .select("id, stock")
            .eq("ean", ean)
            .maybeSingle()

          if (!product) {
            noStock++
            continue
          }

          const newStock = product.stock || 0

          // Actualizar stock en ML
          const updateResponse = await fetch(`https://api.mercadolibre.com/items/${item.id}`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ available_quantity: newStock })
          })

          if (updateResponse.ok) {
            updated++

            // Verificar si ya existe en ml_publications
            const { data: existingPub } = await supabase
              .from("ml_publications")
              .select("id, product_id")
              .eq("ml_item_id", item.id)
              .maybeSingle()

            if (existingPub) {
              // Actualizar con product_id si no lo tenía (vincular)
              if (!existingPub.product_id) {
                await supabase
                  .from("ml_publications")
                  .update({ 
                    product_id: product.id,
                    current_stock: newStock,
                    last_sync_at: new Date().toISOString()
                  })
                  .eq("id", existingPub.id)
                linked++
              } else {
                // Solo actualizar stock
                await supabase
                  .from("ml_publications")
                  .update({ 
                    current_stock: newStock,
                    last_sync_at: new Date().toISOString()
                  })
                  .eq("id", existingPub.id)
              }
            } else {
              // Crear nueva entrada vinculada
              await supabase.from("ml_publications").insert({
                account_id: account.id,
                ml_item_id: item.id,
                product_id: product.id,
                title: item.title,
                status: "active",
                current_stock: newStock,
                last_sync_at: new Date().toISOString()
              })
              linked++
            }
          } else {
            errors++
          }
        }

        // Delay para no saturar ML API
        await new Promise(resolve => setTimeout(resolve, 300))

      } catch (error) {
        console.error("Error processing batch:", error)
        errors += batch.length
      }
    }

    // Actualizar estadísticas de la cuenta
    await supabase.from("ml_accounts").update({
      last_stock_sync_at: new Date().toISOString(),
      stock_sync_count: updated
    }).eq("id", account_id)

    return NextResponse.json({
      success: true,
      total_in_ml: totalInML,
      processed: itemIds.length,
      updated,
      linked,
      no_stock: noStock,
      no_ean: noEan,
      errors
    })

  } catch (error) {
    console.error("Error en sync-stock:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 })
  }
}

// GET para ejecutar sync de todas las cuentas con auto_sync_stock habilitado
export async function GET() {
  try {
    const supabase = await createClient()

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
          body: JSON.stringify({ account_id: account.id, limit: 200 })
        })
        const data = await response.json()
        results.push({ account: account.nickname, ...data })
      } catch (err) {
        results.push({ account: account.nickname, error: "Error al sincronizar" })
      }
    }

    return NextResponse.json({
      success: true,
      accounts_processed: accounts.length,
      results
    })

  } catch (error) {
    console.error("Error en sync-stock GET:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 })
  }
}
