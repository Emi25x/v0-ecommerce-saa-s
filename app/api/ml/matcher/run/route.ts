import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/ml/matcher/run
 * Vincula publicaciones ML con productos por SKU/EAN/ISBN
 * Usa ml_matcher_progress unificado para estado + progreso + métricas
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

    console.log(`[MATCHER] Starting for account ${accountId}, batch: ${batch_size}, max: ${max_seconds}s`)

    const supabase = await createClient({ useServiceRole: true })

    // Inicializar progreso como "running"
    const { error: initError } = await supabase
      .from("ml_matcher_progress")
      .upsert({
        account_id: accountId,
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        scanned_count: 0,
        candidate_count: 0,
        matched_count: 0,
        ambiguous_count: 0,
        not_found_count: 0,
        invalid_identifier_count: 0,
        error_count: 0,
        last_error: null,
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (initError) {
      console.error(`[MATCHER] Failed to init progress:`, initError)
      return NextResponse.json({ error: "Failed to init progress" }, { status: 500 })
    }

    // Métricas locales
    let scanned = 0
    let candidates = 0
    let matched = 0
    let ambiguous = 0
    let notFound = 0
    let invalidId = 0
    let errors = 0

    const PROGRESS_UPDATE_INTERVAL = 200

    // Obtener publicaciones sin vincular
    const { data: unmatchedPubs, error: fetchError } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title, sku, isbn, ean, gtin, product_id")
      .eq("account_id", accountId)
      .is("product_id", null)
      .limit(batch_size)

    if (fetchError) {
      console.error(`[MATCHER] Error fetching publications:`, fetchError)
      await supabase
        .from("ml_matcher_progress")
        .update({ 
          status: "failed", 
          last_error: fetchError.message, 
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("account_id", accountId)
      
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!unmatchedPubs || unmatchedPubs.length === 0) {
      console.log(`[MATCHER] No unmatched publications found`)
      await supabase
        .from("ml_matcher_progress")
        .update({ 
          status: "completed", 
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("account_id", accountId)
      
      return NextResponse.json({ 
        ok: true, 
        scanned: 0,
        message: "No publications to match"
      })
    }

    console.log(`[MATCHER] Processing ${unmatchedPubs.length} publications`)

    // Procesar cada publicación
    for (const pub of unmatchedPubs) {
      scanned++

      // Extraer identificadores del título
      const identifiers = extractIdentifiersFromTitle(pub.title)
      
      // Agregar identificadores de atributos
      if (pub.isbn) identifiers.isbn.push(normalizeIdentifier(pub.isbn))
      if (pub.ean) identifiers.ean.push(normalizeIdentifier(pub.ean))
      if (pub.gtin) identifiers.gtin.push(normalizeIdentifier(pub.gtin))
      if (pub.sku) identifiers.sku.push(normalizeIdentifier(pub.sku))

      // Si no tiene identificadores, marcar como invalid
      const hasAnyIdentifier = identifiers.isbn.length + identifiers.ean.length + identifiers.gtin.length + identifiers.sku.length > 0
      
      if (!hasAnyIdentifier) {
        invalidId++
        
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

      candidates++

      // Intentar match por cada tipo de identificador
      let matched_product_id: string | null = null
      let matchType: string | null = null
      let matchedValue: string | null = null
      let totalMatches = 0

      // Prioridad: ISBN > EAN > GTIN > SKU
      for (const isbn of identifiers.isbn) {
        const { data: products } = await supabase
          .from("products")
          .select("id")
          .eq("isbn", isbn)
          .limit(2)
        
        if (products && products.length === 1) {
          matched_product_id = products[0].id
          matchType = "isbn"
          matchedValue = isbn
          totalMatches = 1
          break
        } else if (products && products.length > 1) {
          totalMatches = products.length
          matchType = "isbn"
          matchedValue = isbn
          break
        }
      }

      if (!matched_product_id && totalMatches === 0) {
        for (const ean of identifiers.ean) {
          const { data: products } = await supabase
            .from("products")
            .select("id")
            .eq("ean", ean)
            .limit(2)
          
          if (products && products.length === 1) {
            matched_product_id = products[0].id
            matchType = "ean"
            matchedValue = ean
            totalMatches = 1
            break
          } else if (products && products.length > 1) {
            totalMatches = products.length
            matchType = "ean"
            matchedValue = ean
            break
          }
        }
      }

      if (!matched_product_id && totalMatches === 0) {
        for (const gtin of identifiers.gtin) {
          const { data: products } = await supabase
            .from("products")
            .select("id")
            .eq("ean", gtin)
            .limit(2)
          
          if (products && products.length === 1) {
            matched_product_id = products[0].id
            matchType = "gtin"
            matchedValue = gtin
            totalMatches = 1
            break
          } else if (products && products.length > 1) {
            totalMatches = products.length
            matchType = "gtin"
            matchedValue = gtin
            break
          }
        }
      }

      if (!matched_product_id && totalMatches === 0) {
        for (const sku of identifiers.sku) {
          const { data: products } = await supabase
            .from("products")
            .select("id")
            .eq("sku", sku)
            .limit(2)
          
          if (products && products.length === 1) {
            matched_product_id = products[0].id
            matchType = "sku"
            matchedValue = sku
            totalMatches = 1
            break
          } else if (products && products.length > 1) {
            totalMatches = products.length
            matchType = "sku"
            matchedValue = sku
            break
          }
        }
      }

      // Determinar outcome y actualizar
      if (matched_product_id) {
        // Match exacto encontrado
        matched++
        
        await supabase
          .from("ml_publications")
          .update({ product_id: matched_product_id, matched_by: matchType })
          .eq("id", pub.id)
        
        await supabase.from("matcher_results").insert({
          account_id: accountId,
          ml_publication_id: pub.id,
          ml_item_id: pub.ml_item_id,
          identifier_type: matchType,
          identifier_value_normalized: matchedValue,
          outcome: "matched",
          matched_product_id,
          match_count: 1,
          reason_code: "EXACT_MATCH"
        })
      } else if (totalMatches > 1) {
        // Múltiples matches (ambiguo)
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
        // No encontrado
        notFound++
        
        await supabase.from("matcher_results").insert({
          account_id: accountId,
          ml_publication_id: pub.id,
          ml_item_id: pub.ml_item_id,
          identifier_type: matchType || identifiers.isbn[0] ? 'isbn' : identifiers.ean[0] ? 'ean' : 'other',
          identifier_value_normalized: matchedValue || identifiers.isbn[0] || identifiers.ean[0] || null,
          outcome: "not_found",
          matched_product_id: null,
          match_count: 0,
          reason_code: "NO_MATCH"
        })
      }

      // Actualizar progreso cada N items
      if (scanned % PROGRESS_UPDATE_INTERVAL === 0) {
        await supabase
          .from("ml_matcher_progress")
          .update({
            scanned_count: scanned,
            candidate_count: candidates,
            matched_count: matched,
            ambiguous_count: ambiguous,
            not_found_count: notFound,
            invalid_identifier_count: invalidId,
            error_count: errors,
            updated_at: new Date().toISOString()
          })
          .eq("account_id", accountId)
        
        console.log(`[MATCHER] Progress: ${scanned}/${unmatchedPubs.length} (${matched} matched)`)
      }

      // Check time budget
      if (Date.now() - startTime > max_seconds * 1000) {
        console.log(`[MATCHER] Time budget exceeded, stopping`)
        break
      }
    }

    // Actualizar totales históricos
    const { data: currentProgress } = await supabase
      .from("ml_matcher_progress")
      .select("total_matched, total_unmatched")
      .eq("account_id", accountId)
      .single()

    const newTotalMatched = (currentProgress?.total_matched || 0) + matched
    const newTotalUnmatched = (currentProgress?.total_unmatched || 0) + (notFound + ambiguous + invalidId)

    // Finalizar
    await supabase
      .from("ml_matcher_progress")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        scanned_count: scanned,
        candidate_count: candidates,
        matched_count: matched,
        ambiguous_count: ambiguous,
        not_found_count: notFound,
        invalid_identifier_count: invalidId,
        error_count: errors,
        total_matched: newTotalMatched,
        total_unmatched: newTotalUnmatched,
        updated_at: new Date().toISOString()
      })
      .eq("account_id", accountId)

    const totalMs = Date.now() - startTime

    console.log(`[MATCHER] Completed: ${matched} matched, ${ambiguous} ambiguous, ${notFound} not found, ${invalidId} invalid in ${totalMs}ms`)

    return NextResponse.json({
      ok: true,
      scanned,
      candidates,
      matched,
      ambiguous,
      not_found: notFound,
      invalid: invalidId,
      errors,
      elapsed_ms: totalMs
    })

  } catch (error: any) {
    console.error(`[MATCHER] Unexpected error:`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper: extraer identificadores del título
function extractIdentifiersFromTitle(title: string): {
  isbn: string[]
  ean: string[]
  gtin: string[]
  sku: string[]
} {
  const result = {
    isbn: [] as string[],
    ean: [] as string[],
    gtin: [] as string[],
    sku: [] as string[]
  }

  if (!title) return result

  // ISBN-13 (978/979 + 10 dígitos)
  const isbn13Pattern = /\b(978|979)[\s\-]?\d{1,5}[\s\-]?\d{1,7}[\s\-]?\d{1,6}[\s\-]?\d\b/g
  const isbn13Matches = title.match(isbn13Pattern)
  if (isbn13Matches) {
    result.isbn.push(...isbn13Matches.map(normalizeIdentifier))
  }

  // ISBN-10 (10 dígitos)
  const isbn10Pattern = /\b\d{1,5}[\s\-]?\d{1,7}[\s\-]?\d{1,6}[\s\-]?[\dXx]\b/g
  const isbn10Matches = title.match(isbn10Pattern)
  if (isbn10Matches) {
    const filtered = isbn10Matches.filter(m => normalizeIdentifier(m).length === 10)
    result.isbn.push(...filtered.map(normalizeIdentifier))
  }

  // EAN-13 (13 dígitos sin 978/979)
  const ean13Pattern = /\b(?!978|979)\d{13}\b/g
  const ean13Matches = title.match(ean13Pattern)
  if (ean13Matches) {
    result.ean.push(...ean13Matches)
  }

  return result
}

// Helper: normalizar identificador
function normalizeIdentifier(id: string): string {
  return id.replace(/[\s\-]/g, '').toUpperCase()
}
