import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/ml/matcher/run
 * Vincula publicaciones ML sin product_id con productos por SKU/EAN/ISBN
 * Body: { account_id, batch_size: 200, max_seconds: 10 }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const body = await request.json()
    const {
      account_id: accountId,
      batch_size = 200,
      max_seconds = 10,
    } = body

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    console.log(`[MATCHER-PRO] Starting for account ${accountId}, batch: ${batch_size}, max: ${max_seconds}s`)

    const supabase = await createClient({ useServiceRole: true })

    // Obtener publicaciones sin vincular
    const { data: unmatchedPubs, error: fetchError } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title, status")
      .eq("account_id", accountId)
      .is("product_id", null)
      .limit(batch_size)

    if (fetchError) {
      console.error(`[MATCHER-PRO] Error fetching publications:`, fetchError)
      return NextResponse.json({ error: "Failed to fetch publications" }, { status: 500 })
    }

    if (!unmatchedPubs || unmatchedPubs.length === 0) {
      console.log(`[MATCHER-PRO] No unmatched publications found`)
      
      // Actualizar stats
      await supabase
        .from("ml_matcher_progress")
        .upsert({
          account_id: accountId,
          total_unmatched: 0,
          last_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

      return NextResponse.json({
        ok: true,
        processed: 0,
        matched: 0,
        remaining: 0,
        message: "No unmatched publications"
      })
    }

    console.log(`[MATCHER-PRO] Processing ${unmatchedPubs.length} publications`)

    let matchedCount = 0
    const processedIds: string[] = []

    // Procesar cada publicación
    for (const pub of unmatchedPubs) {
      // Timeout check
      if (Date.now() - startTime > max_seconds * 1000) {
        console.log(`[MATCHER-PRO] Timeout reached, stopping at ${processedIds.length} processed`)
        break
      }

      processedIds.push(pub.id)

      // Extraer SKU/EAN/ISBN del título (formato común: "SKU:xxx" o "EAN:xxx")
      const title = pub.title || ""
      const skuMatch = title.match(/SKU[:\s]+([A-Z0-9-]+)/i)
      const eanMatch = title.match(/EAN[:\s]+(\d{13})/i)
      const isbnMatch = title.match(/ISBN[:\s]+(\d{10,13})/i)

      let matchedProduct = null
      let matchedBy = null

      // 1. Buscar por SKU exacto
      if (skuMatch && skuMatch[1]) {
        const sku = skuMatch[1].trim()
        const { data: products } = await supabase
          .from("products")
          .select("id")
          .eq("sku", sku)
          .limit(2)

        if (products && products.length === 1) {
          matchedProduct = products[0]
          matchedBy = "auto_sku"
        }
      }

      // 2. Si no hay match por SKU, buscar por EAN exacto
      if (!matchedProduct && eanMatch && eanMatch[1]) {
        const ean = eanMatch[1].trim()
        const { data: products } = await supabase
          .from("products")
          .select("id")
          .eq("ean", ean)
          .limit(2)

        if (products && products.length === 1) {
          matchedProduct = products[0]
          matchedBy = "auto_ean"
        }
      }

      // 3. Si no hay match, buscar por ISBN exacto
      if (!matchedProduct && isbnMatch && isbnMatch[1]) {
        const isbn = isbnMatch[1].trim()
        const { data: products } = await supabase
          .from("products")
          .select("id")
          .eq("isbn", isbn)
          .limit(2)

        if (products && products.length === 1) {
          matchedProduct = products[0]
          matchedBy = "auto_isbn"
        }
      }

      // Si encontramos exactamente 1 producto, vincular
      if (matchedProduct && matchedBy) {
        const { error: updateError } = await supabase
          .from("ml_publications")
          .update({
            product_id: matchedProduct.id,
            matched_by: matchedBy,
            updated_at: new Date().toISOString()
          })
          .eq("id", pub.id)

        if (!updateError) {
          matchedCount++
          console.log(`[MATCHER-PRO] Matched ${pub.ml_item_id} with product ${matchedProduct.id} by ${matchedBy}`)
        } else {
          console.error(`[MATCHER-PRO] Error updating publication ${pub.id}:`, updateError)
        }
      }
    }

    // Contar remaining
    const { count: remainingCount } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("product_id", null)

    // Actualizar stats
    await supabase
      .from("ml_matcher_progress")
      .upsert({
        account_id: accountId,
        total_unmatched: remainingCount || 0,
        total_matched: matchedCount,
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[MATCHER-PRO] Completed: processed=${processedIds.length}, matched=${matchedCount}, remaining=${remainingCount}, elapsed=${elapsed}s`)

    return NextResponse.json({
      ok: true,
      processed: processedIds.length,
      matched: matchedCount,
      remaining: remainingCount || 0,
      elapsed: parseFloat(elapsed)
    })

  } catch (error: any) {
    console.error("[MATCHER-PRO] Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
