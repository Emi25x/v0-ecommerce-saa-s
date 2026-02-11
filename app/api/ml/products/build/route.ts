import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/ml/products/build
 * Crea/actualiza productos en la tabla products desde ml_publications
 * Body: { account_id, max_seconds: 10, batch_size: 100 }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const body = await request.json()
    const {
      account_id,
      max_seconds = 10,
      batch_size = 100,
    } = body

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Inicializar o actualizar progress
    const { data: progress } = await supabase
      .from("product_builder_progress")
      .select("*")
      .eq("account_id", account_id)
      .maybeSingle()

    if (!progress) {
      // Contar total de publicaciones con identificadores
      const { count: totalPubs } = await supabase
        .from("ml_publications")
        .select("*", { count: "exact", head: true })
        .eq("account_id", account_id)
        .or("sku.not.is.null,isbn.not.is.null,ean.not.is.null")

      await supabase.from("product_builder_progress").insert({
        account_id,
        publications_total: totalPubs || 0,
        publications_processed: 0,
        products_created: 0,
        products_updated: 0,
        status: "running",
      })
    } else {
      await supabase
        .from("product_builder_progress")
        .update({ status: "running", last_run_at: new Date().toISOString() })
        .eq("account_id", account_id)
    }

    let created = 0
    let updated = 0
    let processed = 0

    // Loop por tiempo limitado
    while (Date.now() - startTime < max_seconds * 1000) {
      // Traer publicaciones sin product_id que tengan identificadores
      const { data: publications } = await supabase
        .from("ml_publications")
        .select("id, ml_item_id, title, price, current_stock, status, permalink, sku, isbn, ean")
        .eq("account_id", account_id)
        .is("product_id", null)
        .or("sku.not.is.null,isbn.not.is.null,ean.not.is.null")
        .limit(batch_size)

      if (!publications || publications.length === 0) {
        console.log(`[PRODUCT-BUILDER] No more publications to process`)
        await supabase
          .from("product_builder_progress")
          .update({ status: "done" })
          .eq("account_id", account_id)
        break
      }

      console.log(`[PRODUCT-BUILDER] Processing ${publications.length} publications`)

      for (const pub of publications) {
        // Buscar si ya existe producto con ese identificador
        let existingProductId = null

        if (pub.sku) {
          const { data } = await supabase
            .from("products")
            .select("id")
            .eq("sku", pub.sku)
            .limit(1)
            .maybeSingle()
          if (data) existingProductId = data.id
        }

        if (!existingProductId && pub.isbn) {
          const { data } = await supabase
            .from("products")
            .select("id")
            .eq("isbn", pub.isbn)
            .limit(1)
            .maybeSingle()
          if (data) existingProductId = data.id
        }

        if (!existingProductId && pub.ean) {
          const { data } = await supabase
            .from("products")
            .select("id")
            .eq("ean", pub.ean)
            .limit(1)
            .maybeSingle()
          if (data) existingProductId = data.id
        }

        if (existingProductId) {
          // Producto existe - vincular
          await supabase
            .from("ml_publications")
            .update({ product_id: existingProductId })
            .eq("id", pub.id)
          updated++
        } else {
          // Producto NO existe - crear nuevo
          const { data: newProduct, error: createError } = await supabase
            .from("products")
            .insert({
              sku: pub.sku || null,
              isbn: pub.isbn || null,
              ean: pub.ean || null,
              title: pub.title,
              description: pub.title,
              price: pub.price || 0,
              stock: pub.current_stock || 0,
              ml_item_id: pub.ml_item_id,
              ml_status: pub.status,
              ml_permalink: pub.permalink,
              ml_account_id: account_id,
              source: ['mercadolibre'],
            })
            .select("id")
            .single()

          if (!createError && newProduct) {
            // Vincular publicación con nuevo producto
            await supabase
              .from("ml_publications")
              .update({ product_id: newProduct.id })
              .eq("id", pub.id)
            created++
          } else {
            console.error(`[PRODUCT-BUILDER] Error creating product:`, createError)
          }
        }

        processed++
      }

      // Actualizar progress
      await supabase
        .from("product_builder_progress")
        .update({
          publications_processed: supabase.rpc('increment', { x: processed }),
          products_created: supabase.rpc('increment', { x: created }),
          products_updated: supabase.rpc('increment', { x: updated }),
        })
        .eq("account_id", account_id)

      // Check time limit
      if (Date.now() - startTime >= max_seconds * 1000) {
        break
      }
    }

    // Marcar como idle al finalizar
    await supabase
      .from("product_builder_progress")
      .update({ status: "idle" })
      .eq("account_id", account_id)

    return NextResponse.json({
      ok: true,
      processed,
      created,
      updated,
      elapsed: ((Date.now() - startTime) / 1000).toFixed(1),
    })
  } catch (error: any) {
    console.error("[PRODUCT-BUILDER] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
