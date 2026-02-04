import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Endpoint para importar publicaciones de ML a nuestra DB
// Diseñado para ser seguro y no gastar el límite de API

export async function POST(request: Request) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const { 
      account_id, 
      dry_run = true,  // Por defecto solo simula, no inserta
      limit = 50,      // Límite bajo por defecto
      offset = 0 
    } = body

    if (!account_id) {
      return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
    }

    // Obtener cuenta ML
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, access_token, nickname")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    const accessToken = account.access_token

    // 1. Obtener IDs de items (una sola llamada a la API)
    const searchResponse = await fetch(
      `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active&limit=${limit}&offset=${offset}`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    )

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      return NextResponse.json({ 
        error: "Error buscando items en ML", 
        details: errorText,
        status: searchResponse.status 
      }, { status: 500 })
    }

    const searchData = await searchResponse.json()
    const itemIds: string[] = searchData.results || []
    const totalInML = searchData.paging?.total || 0

    if (itemIds.length === 0) {
      return NextResponse.json({ 
        success: true,
        message: "No hay items para importar",
        total_in_ml: totalInML,
        dry_run 
      })
    }

    // 2. Obtener detalles de los items (una llamada por lote de 20)
    const results: any[] = []
    let imported = 0
    let noMatch = 0
    let alreadyExists = 0
    let errors = 0

    // Procesar en lotes de 20 (límite de ML)
    for (let i = 0; i < itemIds.length; i += 20) {
      const batch = itemIds.slice(i, i + 20)
      const idsParam = batch.join(",")

      const detailsResponse = await fetch(
        `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,price,status,permalink,available_quantity,date_created,attributes`,
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      )

      if (!detailsResponse.ok) continue

      const itemsDetails = await detailsResponse.json()

      for (const itemWrapper of itemsDetails) {
        if (itemWrapper.code !== 200 || !itemWrapper.body) continue
        
        const item = itemWrapper.body

        // Extraer EAN de atributos
        let ean: string | null = null
        if (item.attributes) {
          for (const attr of item.attributes) {
            if (["GTIN", "EAN", "ISBN"].includes(attr.id) && attr.value_name) {
              ean = attr.value_name
              break
            }
          }
        }

        // Buscar producto en nuestra DB por EAN
        let productId: string | null = null
        if (ean) {
          const { data: product } = await supabase
            .from("products")
            .select("id")
            .eq("ean", ean)
            .maybeSingle()
          productId = product?.id || null
        }

        // Verificar si ya existe en ml_publications
        const { data: existing } = await supabase
          .from("ml_publications")
          .select("id")
          .eq("ml_item_id", item.id)
          .maybeSingle()

        if (existing) {
          alreadyExists++
          continue
        }

        if (!productId) {
          noMatch++
          results.push({
            ml_item_id: item.id,
            title: item.title?.substring(0, 50),
            ean,
            status: "no_match",
            reason: ean ? "EAN no encontrado en DB" : "Sin EAN en atributos"
          })
          continue
        }

        // Si es dry_run, solo registrar lo que haríamos
        if (dry_run) {
          imported++
          results.push({
            ml_item_id: item.id,
            title: item.title?.substring(0, 50),
            ean,
            product_id: productId,
            status: "would_import"
          })
        } else {
          // Insertar en ml_publications
          const { error: insertError } = await supabase
            .from("ml_publications")
            .insert({
              ml_item_id: item.id,
              account_id: account_id,
              product_id: productId,
              title: item.title,
              price: item.price,
              status: item.status || "active",
              permalink: item.permalink,
              current_stock: item.available_quantity,
              published_at: item.date_created,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })

          if (insertError) {
            errors++
            results.push({
              ml_item_id: item.id,
              status: "error",
              error: insertError.message
            })
          } else {
            imported++
            results.push({
              ml_item_id: item.id,
              status: "imported"
            })
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      dry_run,
      total_in_ml: totalInML,
      processed: itemIds.length,
      imported,
      no_match: noMatch,
      already_exists: alreadyExists,
      errors,
      offset,
      next_offset: offset + limit,
      has_more: offset + limit < totalInML,
      results: results.slice(0, 20) // Solo mostrar primeros 20 resultados
    })

  } catch (error) {
    console.error("Error en import-publications:", error)
    return NextResponse.json({ 
      error: "Error interno", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 })
  }
}
