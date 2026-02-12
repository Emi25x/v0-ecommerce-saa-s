import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/ml/matcher/run
 * Vincula publicaciones ML sin product_id con productos por SKU/EAN/ISBN
 * CON observabilidad completa: progreso, resultados, trazabilidad
 * Body: { account_id, batch_size: 200, max_seconds: 10 }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let runId: string | null = null
  
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

    // Crear run
    const { data: run, error: runError } = await supabase
      .from("matcher_runs")
      .insert({
        account_id: accountId,
        time_budget_seconds: max_seconds,
        batch_size,
        status: "running"
      })
      .select()
      .single()

    if (runError || !run) {
      console.error(`[MATCHER-PRO] Failed to create run:`, runError)
      return NextResponse.json({ error: "Failed to create run" }, { status: 500 })
    }

    runId = run.id

    // Crear registro de progreso
    await supabase
      .from("matcher_run_progress")
      .insert({ run_id: runId })

    console.log(`[MATCHER-PRO] Created run ${runId}`)

    // Métricas acumuladas
    let scanned = 0
    let candidates = 0
    let matched = 0
    let ambiguous = 0
    let notFound = 0
    let invalidId = 0
    let skipped = 0
    let errors = 0

    const PROGRESS_UPDATE_INTERVAL = 200 // Actualizar progreso cada 200 items

    // Obtener publicaciones sin vincular
    const { data: unmatchedPubs, error: fetchError } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title, status, product_id")
      .eq("account_id", accountId)
      .limit(batch_size)

    if (fetchError) {
      console.error(`[MATCHER-PRO] Error fetching publications:`, fetchError)
      await supabase
        .from("matcher_runs")
        .update({ status: "failed", last_error: fetchError.message, finished_at: new Date().toISOString() })
        .eq("id", runId)
      return NextResponse.json({ error: "Failed to fetch publications" }, { status: 500 })
    }

    if (!unmatchedPubs || unmatchedPubs.length === 0) {
      console.log(`[MATCHER-PRO] No publications found`)
      await supabase
        .from("matcher_runs")
        .update({ 
          status: "completed",
          finished_at: new Date().toISOString(),
          totals: { scanned: 0, candidates: 0, matched: 0, ambiguous: 0, not_found: 0, invalid_id: 0, skipped: 0, errors: 0 }
        })
        .eq("id", runId)

      return NextResponse.json({
        ok: true,
        run_id: runId,
        processed: 0,
        matched: 0,
        message: "No publications found"
      })
    }

    console.log(`[MATCHER-PRO] Processing ${unmatchedPubs.length} publications`)

    const resultsToInsert: any[] = []

    // Procesar cada publicación
    for (const pub of unmatchedPubs) {
      // Timeout check
      if (Date.now() - startTime > max_seconds * 1000) {
        console.log(`[MATCHER-PRO] Timeout reached at ${scanned} scanned`)
        break
      }

      scanned++

      // Ya vinculada? Skip
      if (pub.product_id) {
        skipped++
        resultsToInsert.push({
          run_id: runId,
          account_id: accountId,
          ml_publication_id: pub.id,
          ml_item_id: pub.ml_item_id,
          outcome: "skipped",
          reason_code: "ALREADY_LINKED",
          match_count: 0
        })
        continue
      }

      const title = pub.title || ""
      
      // Extraer identificadores numéricos (ISBN, EAN, GTIN)
      const isbnMatch = title.match(/ISBN[:\s-]*(\d{10}|\d{13})/i)
      const eanMatch = title.match(/EAN[:\s-]*(\d{13})/i)
      const gtinMatch = title.match(/GTIN[:\s-]*(\d{12,14})/i)

      if (!isbnMatch && !eanMatch && !gtinMatch) {
        skipped++
        resultsToInsert.push({
          run_id: runId,
          account_id: accountId,
          ml_publication_id: pub.id,
          ml_item_id: pub.ml_item_id,
          outcome: "skipped",
          reason_code: "NO_IDENTIFIER",
          match_count: 0
        })
        continue
      }

      candidates++

      let matchedProduct = null
      let matchedBy = null
      let identifierType = null
      let identifierValue = null
      let matchCount = 0

      try {
        // 1. Buscar por ISBN exacto
        if (!matchedProduct && isbnMatch && isbnMatch[1]) {
          const isbn = isbnMatch[1].replace(/[^0-9]/g, '').trim()
          identifierType = "isbn"
          identifierValue = isbn
          
          if (isbn.length < 10) {
            invalidId++
            resultsToInsert.push({
              run_id: runId,
              account_id: accountId,
              ml_publication_id: pub.id,
              ml_item_id: pub.ml_item_id,
              identifier_type: identifierType,
              identifier_value_normalized: identifierValue,
              outcome: "invalid",
              reason_code: "INVALID_ISBN_LENGTH",
              match_count: 0
            })
            continue
          }

          const { data: products } = await supabase
            .from("products")
            .select("id, isbn")
            .not("isbn", "is", null)
            .limit(3)

          const matches = products?.filter(p => {
            const productIsbn = (p.isbn || '').replace(/[^0-9]/g, '')
            return productIsbn === isbn
          }) || []

          matchCount = matches.length

          if (matches.length === 1) {
            matchedProduct = matches[0]
            matchedBy = "auto_isbn"
            console.log(`[MATCHER-PRO] ISBN match: ${isbn} -> product ${matchedProduct.id}`)
          } else if (matches.length > 1) {
            ambiguous++
            resultsToInsert.push({
              run_id: runId,
              account_id: accountId,
              ml_publication_id: pub.id,
              ml_item_id: pub.ml_item_id,
              identifier_type: identifierType,
              identifier_value_normalized: identifierValue,
              outcome: "ambiguous",
              reason_code: "MULTIPLE_MATCHES",
              match_count: matchCount,
              debug: { candidate_ids: matches.map(m => m.id) }
            })
            console.log(`[MATCHER-PRO] ISBN ${isbn} has ${matchCount} matches - skipping`)
            continue
          }
        }

        // 2. Buscar por EAN/GTIN exacto
        if (!matchedProduct && (eanMatch || gtinMatch)) {
          const ean = (eanMatch?.[1] || gtinMatch?.[1] || '').replace(/[^0-9]/g, '').trim()
          identifierType = eanMatch ? "ean" : "gtin"
          identifierValue = ean
          
          if (ean.length < 12) {
            invalidId++
            resultsToInsert.push({
              run_id: runId,
              account_id: accountId,
              ml_publication_id: pub.id,
              ml_item_id: pub.ml_item_id,
              identifier_type: identifierType,
              identifier_value_normalized: identifierValue,
              outcome: "invalid",
              reason_code: "INVALID_EAN_LENGTH",
              match_count: 0
            })
            continue
          }

          const { data: products } = await supabase
            .from("products")
            .select("id, ean")
            .not("ean", "is", null)
            .limit(3)

          const matches = products?.filter(p => {
            const productEan = (p.ean || '').replace(/[^0-9]/g, '')
            return productEan === ean
          }) || []

          matchCount = matches.length

          if (matches.length === 1) {
            matchedProduct = matches[0]
            matchedBy = "auto_ean"
            console.log(`[MATCHER-PRO] EAN/GTIN match: ${ean} -> product ${matchedProduct.id}`)
          } else if (matches.length > 1) {
            ambiguous++
            resultsToInsert.push({
              run_id: runId,
              account_id: accountId,
              ml_publication_id: pub.id,
              ml_item_id: pub.ml_item_id,
              identifier_type: identifierType,
              identifier_value_normalized: identifierValue,
              outcome: "ambiguous",
              reason_code: "MULTIPLE_MATCHES",
              match_count: matchCount,
              debug: { candidate_ids: matches.map(m => m.id) }
            })
            console.log(`[MATCHER-PRO] EAN ${ean} has ${matchCount} matches - skipping`)
            continue
          }
        }

        // Si no hubo match, registrar como not_found
        if (!matchedProduct && identifierValue) {
          notFound++
          resultsToInsert.push({
            run_id: runId,
            account_id: accountId,
            ml_publication_id: pub.id,
            ml_item_id: pub.ml_item_id,
            identifier_type: identifierType,
            identifier_value_normalized: identifierValue,
            outcome: "not_found",
            reason_code: "NO_MATCH",
            match_count: 0
          })
          continue
        }

        // Si encontramos EXACTAMENTE 1 producto, vincular
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
            matched++
            resultsToInsert.push({
              run_id: runId,
              account_id: accountId,
              ml_publication_id: pub.id,
              ml_item_id: pub.ml_item_id,
              identifier_type: identifierType,
              identifier_value_normalized: identifierValue,
              outcome: "matched",
              matched_product_id: matchedProduct.id,
              reason_code: "EXACT_MATCH",
              match_count: 1
            })
            console.log(`[MATCHER-PRO] Matched ${pub.ml_item_id} with product ${matchedProduct.id}`)
          } else {
            errors++
            resultsToInsert.push({
              run_id: runId,
              account_id: accountId,
              ml_publication_id: pub.id,
              ml_item_id: pub.ml_item_id,
              identifier_type: identifierType,
              identifier_value_normalized: identifierValue,
              outcome: "error",
              reason_code: "UPDATE_FAILED",
              match_count: 0,
              debug: { error: updateError.message }
            })
            console.error(`[MATCHER-PRO] Error updating publication ${pub.id}:`, updateError)
          }
        }

      } catch (err: any) {
        errors++
        resultsToInsert.push({
          run_id: runId,
          account_id: accountId,
          ml_publication_id: pub.id,
          ml_item_id: pub.ml_item_id,
          outcome: "error",
          reason_code: "EXCEPTION",
          match_count: 0,
          debug: { error: err.message }
        })
        console.error(`[MATCHER-PRO] Exception processing ${pub.ml_item_id}:`, err.message)
      }

      // Actualizar progreso cada N items
      if (scanned % PROGRESS_UPDATE_INTERVAL === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const itemsPerSec = scanned / elapsed

        await supabase
          .from("matcher_run_progress")
          .update({
            scanned_count: scanned,
            candidate_count: candidates,
            matched_count: matched,
            ambiguous_count: ambiguous,
            not_found_count: notFound,
            invalid_id_count: invalidId,
            skipped_count: skipped,
            error_count: errors,
            items_per_second: itemsPerSec,
            updated_at: new Date().toISOString()
          })
          .eq("run_id", runId)

        console.log(`[MATCHER-PRO] Progress: ${scanned} scanned, ${matched} matched, ${itemsPerSec.toFixed(1)} items/s`)
      }
    }

    // Insertar resultados en batch
    if (resultsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("matcher_results")
        .insert(resultsToInsert)

      if (insertError) {
        console.error(`[MATCHER-PRO] Failed to insert results:`, insertError)
      } else {
        console.log(`[MATCHER-PRO] Inserted ${resultsToInsert.length} results`)
      }
    }

    // Actualizar progreso final
    const elapsed = (Date.now() - startTime) / 1000
    const itemsPerSec = scanned / elapsed

    await supabase
      .from("matcher_run_progress")
      .update({
        scanned_count: scanned,
        candidate_count: candidates,
        matched_count: matched,
        ambiguous_count: ambiguous,
        not_found_count: notFound,
        invalid_id_count: invalidId,
        skipped_count: skipped,
        error_count: errors,
        items_per_second: itemsPerSec,
        updated_at: new Date().toISOString()
      })
      .eq("run_id", runId)

    // Marcar run como completado
    const totals = {
      scanned,
      candidates,
      matched,
      ambiguous,
      not_found: notFound,
      invalid_id: invalidId,
      skipped,
      errors
    }

    await supabase
      .from("matcher_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        totals
      })
      .eq("id", runId)

    console.log(`[MATCHER-PRO] Run ${runId} completed: scanned=${scanned}, matched=${matched}, elapsed=${elapsed.toFixed(1)}s`)

    return NextResponse.json({
      ok: true,
      run_id: runId,
      processed: scanned,
      matched,
      ambiguous,
      not_found: notFound,
      invalid: invalidId,
      skipped,
      errors,
      elapsed: parseFloat(elapsed.toFixed(1)),
      items_per_second: parseFloat(itemsPerSec.toFixed(1))
    })

  } catch (error: any) {
    console.error("[MATCHER-PRO] Error:", error.message)
    
    // Marcar run como failed si existe
    if (runId) {
      const supabase = await createClient({ useServiceRole: true })
      await supabase
        .from("matcher_runs")
        .update({
          status: "failed",
          last_error: error.message,
          finished_at: new Date().toISOString()
        })
        .eq("id", runId)
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
