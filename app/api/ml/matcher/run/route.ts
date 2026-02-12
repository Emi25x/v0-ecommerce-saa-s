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

    // Obtener publicaciones sin vincular con manejo de rate limiting
    console.log(`[MATCHER] Fetching unmatched publications...`)
    let unmatchedPubs = null
    let fetchError = null
    
    try {
      const response = await supabase
        .from("ml_publications")
        .select("id, ml_item_id, title, sku, isbn, ean, gtin")
        .eq("account_id", accountId)
        .is("product_id", null)
        .limit(batch_size)
      
      unmatchedPubs = response.data
      fetchError = response.error
    } catch (error: any) {
      // Capturar errores de parsing JSON (rate limiting)
      console.error(`[MATCHER] Error fetching publications:`, error)
      fetchError = { message: error.message || "Database error" }
    }

    if (fetchError) {
      console.error(`[MATCHER] Fetch error:`, fetchError)
      
      const errorMessage = fetchError.message?.includes("Too Many") 
        ? "Database rate limit exceeded. Please wait and try again."
        : fetchError.message
      
      await supabase
        .from("ml_matcher_progress")
        .update({ 
          status: "failed", 
          last_error: errorMessage, 
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("account_id", accountId)
      
      return NextResponse.json({ 
        error: errorMessage,
        rate_limited: fetchError.message?.includes("Too Many")
      }, { status: fetchError.message?.includes("Too Many") ? 429 : 500 })
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

    // OPTIMIZATION: Cargar todos los productos UNA SOLA VEZ para evitar rate limiting
    console.log(`[MATCHER] Loading all products with identifiers...`)
    const { data: allProducts, error: productsError } = await supabase
      .from("products")
      .select("id, isbn, ean, sku")
      .or("isbn.not.is.null,ean.not.is.null,sku.not.is.null")
    
    if (productsError) {
      console.error(`[MATCHER] Error loading products:`, productsError)
      
      await supabase
        .from("ml_matcher_progress")
        .update({ 
          status: "failed", 
          last_error: `Failed to load products: ${productsError.message}`, 
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("account_id", accountId)
      
      throw new Error(`Failed to load products: ${productsError.message}`)
    }

    console.log(`[MATCHER] Loaded ${allProducts?.length || 0} products`)

    // Crear índices en memoria para búsqueda rápida (sin gtin - solo existe en ml_publications)
    const isbnIndex = new Map<string, string[]>() // isbn -> [productId, ...]
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

    // Batch de updates para vincular publicaciones con productos
    const publicationsToUpdate: Array<{ id: string; product_id: string; matched_by: string }> = []

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
        continue
      }

      candidates++

      // Intentar match por cada tipo de identificador usando índices en memoria
      let matched_product_id: string | null = null
      let matchType: string | null = null
      let totalMatches = 0

      // Prioridad: ISBN > EAN > GTIN > SKU
      for (const isbn of identifiers.isbn) {
        const productIds = isbnIndex.get(isbn) || []
        
        if (productIds.length === 1) {
          matched_product_id = productIds[0]
          matchType = "isbn"
          totalMatches = 1
          break
        } else if (productIds.length > 1) {
          totalMatches = productIds.length
          matchType = "isbn"
          break
        }
      }

      if (!matched_product_id && totalMatches === 0) {
        for (const ean of identifiers.ean) {
          const productIds = eanIndex.get(ean) || []
          
          if (productIds.length === 1) {
            matched_product_id = productIds[0]
            matchType = "ean"
            totalMatches = 1
            break
          } else if (productIds.length > 1) {
            totalMatches = productIds.length
            matchType = "ean"
            break
          }
        }
      }

      // Skip GTIN matching - products table doesn't have gtin column (only ml_publications has it)

      if (!matched_product_id && totalMatches === 0) {
        for (const sku of identifiers.sku) {
          const productIds = skuIndex.get(sku) || []
          
          if (productIds.length === 1) {
            matched_product_id = productIds[0]
            matchType = "sku"
            totalMatches = 1
            break
          } else if (productIds.length > 1) {
            totalMatches = productIds.length
            matchType = "sku"
            break
          }
        }
      }

      // Determinar outcome
      if (matched_product_id) {
        // Match exacto encontrado
        matched++
        publicationsToUpdate.push({
          id: pub.id,
          product_id: matched_product_id,
          matched_by: matchType!
        })
      } else if (totalMatches > 1) {
        // Múltiples matches (ambiguo)
        ambiguous++
      } else {
        // No encontrado
        notFound++
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
        
        console.log(`[MATCHER] Progress: ${scanned}/${unmatchedPubs.length} (${matched} matched, ${ambiguous} ambiguous, ${notFound} not_found, ${invalidId} invalid)`)
      }

      // Check time budget
      if (Date.now() - startTime > max_seconds * 1000) {
        console.log(`[MATCHER] Time budget exceeded, stopping`)
        break
      }
    }

    // Batch update de todas las publicaciones vinculadas
    if (publicationsToUpdate.length > 0) {
      console.log(`[MATCHER] Batch updating ${publicationsToUpdate.length} matched publications`)
      
      for (const update of publicationsToUpdate) {
        await supabase
          .from("ml_publications")
          .update({ 
            product_id: update.product_id,
            matched_by: update.matched_by
          })
          .eq("id", update.id)
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
