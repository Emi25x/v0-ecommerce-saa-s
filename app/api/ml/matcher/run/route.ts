import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

/**
 * POST /api/ml/matcher/run
 * Ejecuta un ciclo de matching por tiempo limitado (alineado con import-pro)
 * Body: { account_id, max_seconds: 12, batch_size: 200 }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let accountId: string | null = null

  try {
    const body = await request.json()
    const {
      account_id,
      max_seconds = 12,
      batch_size = 200
    } = body

    accountId = account_id

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    console.log(`[MATCHER] Run starting for account ${accountId}, max_seconds: ${max_seconds}, batch: ${batch_size}`)

    const supabase = await createClient({ useServiceRole: true })

    // Verificar cuenta
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle()

    if (accountError || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    // Obtener o crear progreso
    let progress = null
    const { data: progressData, error: progressError } = await supabase
      .from("ml_matcher_progress")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle()

    if (progressError && progressError.code !== 'PGRST116') {
      return NextResponse.json({ error: "Database error", details: progressError.message }, { status: 500 })
    }

    // Inicializar progress si no existe
    if (!progressData) {
      const { data: newProgress, error: createError } = await supabase
        .from("ml_matcher_progress")
        .insert({
          account_id: accountId,
          status: 'idle',
          total_target: 0,
          processed_count: 0,
          matched_count: 0,
          ambiguous_count: 0,
          not_found_count: 0,
          invalid_identifier_count: 0,
          error_count: 0
        })
        .select()
        .single()

      if (createError) {
        return NextResponse.json({ error: "Failed to initialize progress" }, { status: 500 })
      }

      progress = newProgress
    } else {
      progress = progressData
    }

    // Evitar runs concurrentes (igual que import)
    if (progress.status === 'running') {
      const lastHeartbeat = progress.last_heartbeat_at ? new Date(progress.last_heartbeat_at) : null
      const now = new Date()
      
      if (lastHeartbeat && (now.getTime() - lastHeartbeat.getTime()) < 30000) {
        console.log(`[MATCHER] Already running (recent heartbeat), returning current status`)
        return NextResponse.json({
          ok: true,
          already_running: true,
          progress: {
            total_target: progress.total_target,
            processed_count: progress.processed_count,
            matched_count: progress.matched_count,
            ambiguous_count: progress.ambiguous_count,
            not_found_count: progress.not_found_count,
            invalid_identifier_count: progress.invalid_identifier_count,
            error_count: progress.error_count,
            status: progress.status
          }
        })
      }
    }

    // Calcular total_target (publicaciones elegibles) SOLO si es nueva corrida o cambió
    const { count: totalTarget } = await supabase
      .from("ml_publications")
      .select("*", { count: 'exact', head: true })
      .eq("account_id", accountId)
      .is("product_id", null)

    console.log(`[MATCHER] Total target: ${totalTarget || 0} unmatched publications`)

    // Si es nueva corrida (processed == 0 o status completed), resetear contadores
    const isNewRun = progress.status === 'completed' || progress.processed_count === 0
    
    if (isNewRun) {
      await supabase
        .from("ml_matcher_progress")
        .update({
          status: 'running',
          total_target: totalTarget || 0,
          processed_count: 0,
          matched_count: 0,
          ambiguous_count: 0,
          not_found_count: 0,
          invalid_identifier_count: 0,
          error_count: 0,
          started_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString(),
          finished_at: null,
          last_error: null
        })
        .eq("account_id", accountId)
      
      progress.processed_count = 0
      progress.matched_count = 0
      progress.ambiguous_count = 0
      progress.not_found_count = 0
      progress.invalid_identifier_count = 0
      progress.error_count = 0
      progress.total_target = totalTarget || 0
    } else {
      // Continuar corrida existente
      await supabase
        .from("ml_matcher_progress")
        .update({
          status: 'running',
          last_heartbeat_at: new Date().toISOString()
        })
        .eq("account_id", accountId)
    }

    // CARGAR TODOS LOS PRODUCTOS UNA SOLA VEZ (evitar rate limiting)
    console.log(`[MATCHER] Loading all products with identifiers...`)
    const { data: allProducts, error: productsError } = await supabase
      .from("products")
      .select("id, isbn, ean, sku")
      .or("isbn.not.is.null,ean.not.is.null,sku.not.is.null")

    if (productsError) {
      await supabase
        .from("ml_matcher_progress")
        .update({
          status: "failed",
          last_error: `Failed to load products: ${productsError.message}`,
          finished_at: new Date().toISOString()
        })
        .eq("account_id", accountId)

      return NextResponse.json({ ok: false, error: productsError.message }, { status: 500 })
    }

    console.log(`[MATCHER] Loaded ${allProducts?.length || 0} products`)

    // Crear índices en memoria
    const isbnIndex = new Map<string, string[]>()
    const eanIndex = new Map<string, string[]>()
    const skuIndex = new Map<string, string[]>()

    for (const product of allProducts || []) {
      if (product.isbn) {
        const key = normalizeIdentifier(product.isbn)
        if (!isbnIndex.has(key)) isbnIndex.set(key, [])
        isbnIndex.get(key)!.push(product.id)
      }
      if (product.ean) {
        const key = normalizeIdentifier(product.ean)
        if (!eanIndex.has(key)) eanIndex.set(key, [])
        eanIndex.get(key)!.push(product.id)
      }
      if (product.sku) {
        const key = normalizeIdentifier(product.sku)
        if (!skuIndex.has(key)) skuIndex.set(key, [])
        skuIndex.get(key)!.push(product.id)
      }
    }

    console.log(`[MATCHER] Built indices: ${isbnIndex.size} ISBNs, ${eanIndex.size} EANs, ${skuIndex.size} SKUs`)

    // Contadores locales de este ciclo
    let processed = 0
    let matched = 0
    let ambiguous = 0
    let notFound = 0
    let invalid = 0
    let errors = 0

    const updateInterval = 200
    const endTime = startTime + (max_seconds * 1000)

    // Procesar publicaciones en batches
    while (Date.now() < endTime) {
      // Fetch batch de publicaciones sin vincular
      const { data: publications, error: pubsError } = await supabase
        .from("ml_publications")
        .select("id, ml_item_id, title, isbn, ean, sku")
        .eq("account_id", accountId)
        .is("product_id", null)
        .limit(batch_size)

      if (pubsError) {
        console.error(`[MATCHER] Error fetching publications:`, pubsError)
        errors++
        break
      }

      if (!publications || publications.length === 0) {
        console.log(`[MATCHER] No more publications to match`)
        break
      }

      console.log(`[MATCHER] Processing batch of ${publications.length} publications`)

      // Procesar cada publicación
      for (const pub of publications) {
        processed++

        // Extraer identificadores
        const identifiers = extractIdentifiersFromTitle(pub.title)
        if (pub.isbn) identifiers.isbn.push(normalizeIdentifier(pub.isbn))
        if (pub.ean) identifiers.ean.push(normalizeIdentifier(pub.ean))
        if (pub.sku) identifiers.sku.push(normalizeIdentifier(pub.sku))

        const hasAnyIdentifier = identifiers.isbn.length + identifiers.ean.length + identifiers.sku.length > 0

        if (!hasAnyIdentifier) {
          invalid++
          // Guardar resultado
          await supabase.from("matcher_results").insert({
            account_id: accountId,
            ml_publication_id: pub.id,
            ml_item_id: pub.ml_item_id,
            identifier_type: null,
            identifier_value_normalized: null,
            outcome: "invalid",
            matched_product_id: null,
            match_count: 0,
            reason_code: "NO_IDENTIFIER"
          })
          continue
        }

        // Intentar match (prioridad: ISBN > EAN > SKU)
        let matchedProductId: string | null = null
        let matchType: string | null = null
        let matchedValue: string | null = null
        let totalMatches = 0

        for (const isbn of identifiers.isbn) {
          const productIds = isbnIndex.get(isbn) || []
          if (productIds.length === 1) {
            matchedProductId = productIds[0]
            matchType = "isbn"
            matchedValue = isbn
            totalMatches = 1
            break
          } else if (productIds.length > 1) {
            totalMatches = productIds.length
            matchType = "isbn"
            matchedValue = isbn
            break
          }
        }

        if (!matchedProductId && totalMatches === 0) {
          for (const ean of identifiers.ean) {
            const productIds = eanIndex.get(ean) || []
            if (productIds.length === 1) {
              matchedProductId = productIds[0]
              matchType = "ean"
              matchedValue = ean
              totalMatches = 1
              break
            } else if (productIds.length > 1) {
              totalMatches = productIds.length
              matchType = "ean"
              matchedValue = ean
              break
            }
          }
        }

        if (!matchedProductId && totalMatches === 0) {
          for (const sku of identifiers.sku) {
            const productIds = skuIndex.get(sku) || []
            if (productIds.length === 1) {
              matchedProductId = productIds[0]
              matchType = "sku"
              matchedValue = sku
              totalMatches = 1
              break
            } else if (productIds.length > 1) {
              totalMatches = productIds.length
              matchType = "sku"
              matchedValue = sku
              break
            }
          }
        }

        // Guardar resultado según outcome
        if (matchedProductId) {
          matched++
          // Update ml_publications SOLO cuando hay match (evita constraint violation)
          await supabase
            .from("ml_publications")
            .update({
              product_id: matchedProductId,
              matched_by: matchType,
              matched_at: new Date().toISOString()
            })
            .eq("id", pub.id)

          // Guardar resultado
          await supabase.from("matcher_results").insert({
            account_id: accountId,
            ml_publication_id: pub.id,
            ml_item_id: pub.ml_item_id,
            identifier_type: matchType,
            identifier_value_normalized: matchedValue,
            outcome: "matched",
            matched_product_id: matchedProductId,
            match_count: 1,
            reason_code: "EXACT_MATCH"
          })
        } else if (totalMatches > 1) {
          ambiguous++
          await supabase.from("matcher_results").insert({
            account_id: accountId,
            ml_publication_id: pub.id,
            ml_item_id: pub.ml_item_id,
            identifier_type: matchType,
            identifier_value_normalized: matchedValue,
            outcome: "ambiguous",
            matched_product_id: null,
            match_count: totalMatches,
            reason_code: "MULTIPLE_MATCHES"
          })
        } else {
          notFound++
          await supabase.from("matcher_results").insert({
            account_id: accountId,
            ml_publication_id: pub.id,
            ml_item_id: pub.ml_item_id,
            identifier_type: null,
            identifier_value_normalized: null,
            outcome: "not_found",
            matched_product_id: null,
            match_count: 0,
            reason_code: "NO_MATCH"
          })
        }

        // Actualizar progreso cada updateInterval items
        if (processed % updateInterval === 0) {
          await supabase
            .from("ml_matcher_progress")
            .update({
              processed_count: progress.processed_count + processed,
              matched_count: progress.matched_count + matched,
              ambiguous_count: progress.ambiguous_count + ambiguous,
              not_found_count: progress.not_found_count + notFound,
              invalid_identifier_count: progress.invalid_identifier_count + invalid,
              error_count: progress.error_count + errors,
              last_heartbeat_at: new Date().toISOString()
            })
            .eq("account_id", accountId)
        }
      }

      // Check timeout
      if (Date.now() >= endTime) {
        console.log(`[MATCHER] Time budget exhausted`)
        break
      }
    }

    // Actualizar progreso final
    const finalProcessed = progress.processed_count + processed
    const finalMatched = progress.matched_count + matched
    const finalAmbiguous = progress.ambiguous_count + ambiguous
    const finalNotFound = progress.not_found_count + notFound
    const finalInvalid = progress.invalid_identifier_count + invalid
    const finalErrors = progress.error_count + errors

    const isDone = finalProcessed >= (progress.total_target || 0)

    await supabase
      .from("ml_matcher_progress")
      .update({
        status: isDone ? 'completed' : 'idle',
        processed_count: finalProcessed,
        matched_count: finalMatched,
        ambiguous_count: finalAmbiguous,
        not_found_count: finalNotFound,
        invalid_identifier_count: finalInvalid,
        error_count: finalErrors,
        finished_at: isDone ? new Date().toISOString() : null,
        last_heartbeat_at: new Date().toISOString(),
        last_run_at: new Date().toISOString()
      })
      .eq("account_id", accountId)

    const elapsed = Date.now() - startTime

    console.log(`[MATCHER] Run completed: ${processed} processed, ${matched} matched, ${ambiguous} ambiguous, ${notFound} not found, ${invalid} invalid in ${(elapsed / 1000).toFixed(1)}s`)

    return NextResponse.json({
      ok: true,
      processed,
      matched,
      ambiguous,
      not_found: notFound,
      invalid,
      errors,
      elapsed_ms: elapsed,
      progress: {
        total_target: progress.total_target,
        processed_count: finalProcessed,
        matched_count: finalMatched,
        ambiguous_count: finalAmbiguous,
        not_found_count: finalNotFound,
        invalid_identifier_count: finalInvalid,
        error_count: finalErrors,
        status: isDone ? 'completed' : 'idle',
        progress_percentage: progress.total_target > 0 ? (finalProcessed / progress.total_target) * 100 : 0
      }
    })

  } catch (error: any) {
    console.error(`[MATCHER] Fatal error:`, error)

    if (accountId) {
      const supabase = await createClient({ useServiceRole: true })
      await supabase
        .from("ml_matcher_progress")
        .update({
          status: 'failed',
          last_error: error.message,
          finished_at: new Date().toISOString()
        })
        .eq("account_id", accountId)
    }

    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 })
  }
}

// Helper functions
function normalizeIdentifier(id: string): string {
  return id.replace(/[-\s]/g, "").toLowerCase()
}

function extractIdentifiersFromTitle(title: string): {
  isbn: string[]
  ean: string[]
  sku: string[]
} {
  const result = { isbn: [], ean: [], sku: [] }
  
  if (!title) return result
  
  // ISBN-13: 13 dígitos
  const isbn13Regex = /\b(?:ISBN[-\s]?13[-:\s]?)?(\d{13})\b/gi
  const isbn13Matches = title.matchAll(isbn13Regex)
  for (const match of isbn13Matches) {
    result.isbn.push(normalizeIdentifier(match[1]))
  }
  
  // ISBN-10: 10 dígitos con posible X al final
  const isbn10Regex = /\b(?:ISBN[-\s]?10[-:\s]?)?(\d{9}[\dxX])\b/gi
  const isbn10Matches = title.matchAll(isbn10Regex)
  for (const match of isbn10Matches) {
    result.isbn.push(normalizeIdentifier(match[1]))
  }
  
  // EAN: 13 dígitos (puede solaparse con ISBN-13)
  const eanRegex = /\b(?:EAN[-:\s]?)?(\d{13})\b/gi
  const eanMatches = title.matchAll(eanRegex)
  for (const match of eanMatches) {
    const normalized = normalizeIdentifier(match[1])
    if (!result.isbn.includes(normalized)) {
      result.ean.push(normalized)
    }
  }
  
  return result
}
