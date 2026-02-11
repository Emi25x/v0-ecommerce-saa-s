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

      // REGLA ESTRICTA: Solo auto-match por identificadores numéricos exactos
      // NO usamos título, descripción, autor ni ningún campo de texto
      const title = pub.title || ""
      
      // Extraer SOLO identificadores numéricos del título ML (formato: "ISBN:xxx", "EAN:xxx")
      // Normalizamos removiendo guiones, espacios, etc.
      const isbnMatch = title.match(/ISBN[:\s-]*(\d{10}|\d{13})/i)
      const eanMatch = title.match(/EAN[:\s-]*(\d{13})/i)
      const gtinMatch = title.match(/GTIN[:\s-]*(\d{12,14})/i)

      let matchedProduct = null
      let matchedBy = null

      // 1. Buscar por ISBN exacto (normalizado)
      if (!matchedProduct && isbnMatch && isbnMatch[1]) {
        const isbn = isbnMatch[1].replace(/[^0-9]/g, '').trim()
        
        // Buscar exactamente en products.isbn
        const { data: products } = await supabase
          .from("products")
          .select("id, isbn")
          .not("isbn", "is", null)
          .limit(3) // Buscar hasta 3 para detectar duplicados

        // Filtrar manualmente por coincidencia normalizada
        const matches = products?.filter(p => {
          const productIsbn = (p.isbn || '').replace(/[^0-9]/g, '')
          return productIsbn === isbn
        }) || []

        // REGLA DE SEGURIDAD: Solo vincular si hay EXACTAMENTE 1 coincidencia
        if (matches.length === 1) {
          matchedProduct = matches[0]
          matchedBy = "auto_isbn"
          console.log(`[MATCHER-PRO] ISBN match: ${isbn} -> product ${matchedProduct.id}`)
        } else if (matches.length > 1) {
          console.log(`[MATCHER-PRO] ISBN ${isbn} has ${matches.length} matches - skipping (not unique)`)
        }
      }

      // 2. Si no hay match por ISBN, buscar por EAN exacto
      if (!matchedProduct && (eanMatch || gtinMatch)) {
        const ean = (eanMatch?.[1] || gtinMatch?.[1] || '').replace(/[^0-9]/g, '').trim()
        
        if (ean.length >= 12) {
          const { data: products } = await supabase
            .from("products")
            .select("id, ean")
            .not("ean", "is", null)
            .limit(3)

          const matches = products?.filter(p => {
            const productEan = (p.ean || '').replace(/[^0-9]/g, '')
            return productEan === ean
          }) || []

          if (matches.length === 1) {
            matchedProduct = matches[0]
            matchedBy = "auto_ean"
            console.log(`[MATCHER-PRO] EAN/GTIN match: ${ean} -> product ${matchedProduct.id}`)
          } else if (matches.length > 1) {
            console.log(`[MATCHER-PRO] EAN ${ean} has ${matches.length} matches - skipping (not unique)`)
          }
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
