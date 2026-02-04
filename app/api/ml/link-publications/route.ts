import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST - Importar y vincular publicaciones de ML con productos por EAN
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { account_id, limit = 200 } = body

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Obtener cuenta ML
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("id, nickname, access_token, ml_user_id")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    // Obtener IDs de publicaciones que ya tenemos en la DB
    const { data: existingPubs } = await supabase
      .from("ml_publications")
      .select("ml_item_id")
      .eq("account_id", account_id)
    
    const existingItemIds = new Set(existingPubs?.map(p => p.ml_item_id) || [])

    // Obtener lista de items activos de ML
    const searchResponse = await fetch(
      `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active&limit=100`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    )

    if (!searchResponse.ok) {
      return NextResponse.json({ error: "Error fetching ML items" }, { status: 500 })
    }

    const searchData = await searchResponse.json()
    const totalInML = searchData.paging?.total || 0
    const allItemIds = searchData.results || []

    // Filtrar solo los que NO tenemos en nuestra DB
    const newItemIds = allItemIds.filter((id: string) => !existingItemIds.has(id))

    let imported = 0
    let linked = 0
    let notFoundProduct = 0
    let errors = 0

    // Procesar items nuevos en lotes de 20
    const itemsToProcess = newItemIds.slice(0, limit)
    
    for (let i = 0; i < itemsToProcess.length; i += 20) {
      const batch = itemsToProcess.slice(i, i + 20)
      const idsParam = batch.join(",")

      try {
        const detailsResponse = await fetch(
          `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,seller_sku,seller_custom_field,attributes,status,price,available_quantity,permalink`,
          { headers: { Authorization: `Bearer ${account.access_token}` } }
        )

        if (!detailsResponse.ok) {
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

          // Buscar producto por EAN
          let productId = null
          if (ean) {
            const { data: product } = await supabase
              .from("products")
              .select("id")
              .eq("ean", ean)
              .maybeSingle()
            
            if (product) {
              productId = product.id
              linked++
            } else {
              notFoundProduct++
            }
          } else {
            notFoundProduct++
          }

          // Insertar en ml_publications
          const { error: insertError } = await supabase
            .from("ml_publications")
            .insert({
              account_id: account.id,
              ml_item_id: item.id,
              product_id: productId,
              title: item.title,
              status: item.status,
              price: item.price,
              stock: item.available_quantity,
              permalink: item.permalink
            })

          if (!insertError) {
            imported++
          } else {
            errors++
          }
        }

        await new Promise(resolve => setTimeout(resolve, 200))

      } catch (error) {
        console.error("Error processing batch:", error)
        errors += batch.length
      }
    }

    // Contar estado actual
    const { count: totalInDB } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)

    const { count: linkedInDB } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)
      .not("product_id", "is", null)

    return NextResponse.json({
      total_in_ml: totalInML,
      total_in_db: totalInDB || 0,
      pending_import: totalInML - (totalInDB || 0),
      imported_now: imported,
      linked_now: linked,
      not_found_product: notFoundProduct,
      errors,
      total_linked: linkedInDB || 0
    })

  } catch (error) {
    console.error("Error linking publications:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
