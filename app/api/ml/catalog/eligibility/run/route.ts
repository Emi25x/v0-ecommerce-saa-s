/**
 * POST /api/ml/catalog/eligibility/run
 *
 * Processes one batch of ml_publications that have an ISBN or EAN but no
 * catalog_product_id yet.  For each publication it calls the ML Products
 * Search API, stores the matched catalog_product_id and marks
 * catalog_listing_eligible = true when a unique match is found.
 *
 * Query params accepted in the JSON body:
 *   account_id  – required
 *   batch_size  – default 20, max 50
 *   offset      – pagination cursor (pass back the value returned in response)
 *   force       – if true, re-processes publications that already have a
 *                 catalog_product_id (useful to refresh stale data)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

const ML_API = "https://api.mercadolibre.com"

// ── Helper: search ML products catalog by identifier ─────────────────────────

async function searchCatalogProduct(
  token: string,
  identifier: string,
  identifierType: "ISBN" | "EAN" | "GTIN",
): Promise<{ catalog_product_id: string | null; match_count: number }> {
  // Normalizar notación científica (ej: 9.78845E+12 → "9788450...")
  let ean = String(identifier).trim()
  if (/^[0-9]+\.?[0-9]*[eE][+\-][0-9]+$/.test(ean)) {
    ean = Number(ean).toFixed(0)
  }

  // product_identifier hace búsqueda exacta por EAN/ISBN — más confiable que q=texto
  // site_id=MLA es requerido para búsquedas en Argentina
  const url = `${ML_API}/products/search?status=active&site_id=MLA&product_identifier=${encodeURIComponent(ean)}`

  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), 8_000)
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(tid)
  }

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`ML ${res.status}: ${txt.slice(0, 200)}`)
  }

  const data = await res.json()
  const results: any[] = data.results ?? []

  if (results.length === 0) return { catalog_product_id: null, match_count: 0 }
  // Only mark eligible when there is an unambiguous single match
  if (results.length === 1) return { catalog_product_id: results[0].id, match_count: 1 }
  return { catalog_product_id: null, match_count: results.length }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      account_id,
      batch_size: rawBatch = 20,
      offset: rawOffset = 0,
      force = false,
    } = body as {
      account_id: string
      batch_size?: number
      offset?: number
      force?: boolean
    }

    if (!account_id) {
      return NextResponse.json({ ok: false, error: "account_id requerido" }, { status: 400 })
    }

    const batchSize = Math.min(Number(rawBatch) || 20, 50)
    const offset    = Number(rawOffset) || 0

    const supabase = await createClient()

    // ── 1. Fetch batch of publications with a usable identifier ──────────────

    let q = supabase
      .from("ml_publications")
      .select("id, ml_item_id, isbn, ean, gtin, catalog_product_id")
      .eq("account_id", account_id)
      .or("isbn.not.is.null,ean.not.is.null,gtin.not.is.null")
      .order("updated_at", { ascending: false })
      .range(offset, offset + batchSize - 1)

    if (!force) {
      q = q.is("catalog_product_id", null)
    }

    const { data: pubs, error: fetchErr } = await q
    if (fetchErr) throw fetchErr

    if (!pubs || pubs.length === 0) {
      return NextResponse.json({ ok: true, done: true, has_more: false, processed: 0, offset })
    }

    // ── 2. Get ML access token ───────────────────────────────────────────────

    const token = await getValidAccessToken(account_id)

    // ── 3. Process each publication ──────────────────────────────────────────

    let matched    = 0
    let not_found  = 0
    let ambiguous  = 0
    let errors     = 0
    let last_error = ""

    for (const pub of pubs) {
      const identifier = pub.isbn || pub.ean || pub.gtin
      if (!identifier) continue

      const identifierType = pub.isbn ? "ISBN" : pub.ean ? "EAN" : "GTIN"

      try {
        const { catalog_product_id, match_count } = await searchCatalogProduct(
          token,
          identifier,
          identifierType,
        )

        const isEligible = catalog_product_id !== null

        await supabase
          .from("ml_publications")
          .update({
            catalog_product_id:       catalog_product_id ?? null,
            catalog_listing_eligible: isEligible,
            updated_at:               new Date().toISOString(),
          })
          .eq("id", pub.id)

        if (isEligible)             matched++
        else if (match_count === 0) not_found++
        else                        ambiguous++

        // Respect ML rate limits — small delay between requests
        await new Promise((r) => setTimeout(r, 150))
      } catch (e: any) {
        errors++
        last_error = e.message ?? "unknown"
        console.error(`[eligibility/run] error ean=${pub.ean ?? pub.isbn ?? pub.gtin}:`, e.message)
      }
    }

    const nextOffset = offset + pubs.length
    const has_more   = pubs.length === batchSize

    return NextResponse.json({
      ok: true,
      done: !has_more,
      has_more,
      processed: pubs.length,
      matched,
      not_found,
      ambiguous,
      errors,
      last_error: last_error || undefined,
      next_offset: nextOffset,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
