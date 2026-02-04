import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST - Vincular publicaciones con productos por EAN (batch inicial o manual)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { account_id, limit = 500 } = body

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

    // Obtener publicaciones sin product_id
    const { data: unlinkedPubs, error: pubsError } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id")
      .eq("account_id", account_id)
      .is("product_id", null)
      .limit(limit)

    if (pubsError) {
      return NextResponse.json({ error: pubsError.message }, { status: 500 })
    }

    if (!unlinkedPubs || unlinkedPubs.length === 0) {
      // Verificar cuántas hay vinculadas vs total
      const { count: totalCount } = await supabase
        .from("ml_publications")
        .select("*", { count: "exact", head: true })
        .eq("account_id", account_id)

      const { count: linkedCount } = await supabase
        .from("ml_publications")
        .select("*", { count: "exact", head: true })
        .eq("account_id", account_id)
        .not("product_id", "is", null)

      return NextResponse.json({
        message: "No hay publicaciones sin vincular",
        total: totalCount || 0,
        linked: linkedCount || 0,
        unlinked: 0
      })
    }

    let linked = 0
    let notFound = 0
    let errors = 0
    const notFoundEans: string[] = []

    // Procesar en lotes de 20 (límite de ML API)
    for (let i = 0; i < unlinkedPubs.length; i += 20) {
      const batch = unlinkedPubs.slice(i, i + 20)
      const itemIds = batch.map(p => p.ml_item_id).join(",")

      try {
        const response = await fetch(
          `https://api.mercadolibre.com/items?ids=${itemIds}&attributes=id,title,seller_sku,seller_custom_field,attributes`,
          { headers: { Authorization: `Bearer ${account.access_token}` } }
        )

        if (!response.ok) {
          console.error("ML API error:", await response.text())
          errors += batch.length
          continue
        }

        const items = await response.json()

        for (const itemWrapper of items) {
          if (itemWrapper.code !== 200 || !itemWrapper.body) {
            errors++
            continue
          }

          const item = itemWrapper.body
          const pub = batch.find(p => p.ml_item_id === item.id)
          if (!pub) continue

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
            notFound++
            continue
          }

          // Buscar producto por EAN
          const { data: product } = await supabase
            .from("products")
            .select("id")
            .eq("ean", ean)
            .maybeSingle()

          if (product) {
            const { error: updateError } = await supabase
              .from("ml_publications")
              .update({ product_id: product.id })
              .eq("id", pub.id)

            if (!updateError) {
              linked++
            } else {
              errors++
            }
          } else {
            notFound++
            if (notFoundEans.length < 10) {
              notFoundEans.push(ean)
            }
          }
        }

        // Delay entre lotes para no saturar ML API
        await new Promise(resolve => setTimeout(resolve, 300))

      } catch (error) {
        console.error("Error processing batch:", error)
        errors += batch.length
      }
    }

    // Contar totales después de la operación
    const { count: remainingUnlinked } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)
      .is("product_id", null)

    return NextResponse.json({
      processed: unlinkedPubs.length,
      linked,
      not_found: notFound,
      errors,
      remaining_unlinked: remainingUnlinked || 0,
      sample_not_found_eans: notFoundEans
    })

  } catch (error) {
    console.error("Error linking publications:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
