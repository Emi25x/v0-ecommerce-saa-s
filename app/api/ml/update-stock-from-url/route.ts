import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"

const ML_API_BASE = "https://api.mercadolibre.com"

interface StockUpdate {
  ean: string
  stock: number
}

interface UpdateResult {
  ml_item_id: string
  ean: string
  old_stock: number
  new_stock: number
  status: "updated" | "skipped" | "error"
  error?: string
}

/**
 * POST /api/ml/update-stock-from-url
 *
 * Fetches a stock file from a URL, auto-detects format,
 * and updates ML publications directly by EAN match.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { account_id, url, dry_run = true } = body

    if (!account_id) {
      return NextResponse.json({ error: "account_id is required" }, { status: 400 })
    }
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 })
    }

    const supabase = await createClient()

    // --- Resolve account (nickname or UUID) ---
    let account: any = null
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (uuidRegex.test(account_id)) {
      const { data } = await supabase.from("ml_accounts").select("*").eq("id", account_id).single()
      account = data
    } else {
      const { data } = await supabase.from("ml_accounts").select("*").eq("nickname", account_id).single()
      account = data
    }

    if (!account) {
      return NextResponse.json({ error: `Account not found: ${account_id}` }, { status: 404 })
    }

    console.log(`[update-stock-from-url] Account resolved: ${account.nickname} (${account.id})`)

    // --- Refresh token if needed ---
    const freshAccount = await refreshTokenIfNeeded(account)
    const accessToken = freshAccount.access_token

    // --- Fetch the file ---
    console.log(`[update-stock-from-url] Fetching file from: ${url}`)
    const fileResponse = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EcommerceBot/1.0)" },
    })

    if (!fileResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch file: ${fileResponse.status} ${fileResponse.statusText}` },
        { status: 502 }
      )
    }

    const buffer = Buffer.from(await fileResponse.arrayBuffer())
    // Try latin1 first (common for Argentine providers), fallback to utf8
    let csvText = buffer.toString("latin1")

    // --- Auto-detect delimiter ---
    const lines = csvText.split("\n").filter(l => l.trim())
    if (lines.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 })
    }

    const delimiter = detectDelimiter(lines[0])
    console.log(`[update-stock-from-url] Detected delimiter: "${delimiter === "\t" ? "TAB" : delimiter}"`)

    // --- Parse header and detect columns ---
    const headerLine = lines[0]
    const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""))

    const eanColIndex = detectEanColumn(headers)
    const stockColIndex = detectStockColumn(headers)

    if (eanColIndex === -1) {
      return NextResponse.json({
        error: "Could not auto-detect EAN column",
        headers,
        hint: "Expected a column named like: EAN, EAN13, CODIGO, ISBN, GTIN, COD_BARRAS"
      }, { status: 400 })
    }

    if (stockColIndex === -1) {
      return NextResponse.json({
        error: "Could not auto-detect stock column",
        headers,
        hint: "Expected a column named like: STOCK, CANTIDAD, QTY, QUANTITY, DISPONIBLE"
      }, { status: 400 })
    }

    console.log(`[update-stock-from-url] EAN column: "${headers[eanColIndex]}" (index ${eanColIndex})`)
    console.log(`[update-stock-from-url] Stock column: "${headers[stockColIndex]}" (index ${stockColIndex})`)

    // --- Parse data rows ---
    const stockUpdates: StockUpdate[] = []
    const parseErrors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const cols = line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ""))
      const eanRaw = cols[eanColIndex]?.replace(/\D/g, "")
      const stockRaw = cols[stockColIndex]?.trim()

      if (!eanRaw || eanRaw.length < 8) {
        continue // Skip rows without valid EAN
      }

      const stock = parseInt(stockRaw, 10)
      if (isNaN(stock) || stock < 0) {
        parseErrors.push(`Row ${i + 1}: invalid stock value "${stockRaw}" for EAN ${eanRaw}`)
        continue
      }

      stockUpdates.push({ ean: eanRaw, stock: Math.min(stock, 9999) })
    }

    console.log(`[update-stock-from-url] Parsed ${stockUpdates.length} valid EAN/stock pairs from ${lines.length - 1} data rows`)

    // --- Get ALL ML publications for this account (paginate past Supabase 1000-row limit) ---
    const allPublications: any[] = []
    const PAGE_SIZE = 1000
    let from = 0
    let hasMore = true

    while (hasMore) {
      const { data: page, error: pubError } = await supabase
        .from("ml_publications")
        .select("id, ml_item_id, ean, gtin, isbn, sku, current_stock, status, title")
        .eq("account_id", account.id)
        .range(from, from + PAGE_SIZE - 1)

      if (pubError) {
        return NextResponse.json({ error: `Failed to fetch publications: ${pubError.message}` }, { status: 500 })
      }

      allPublications.push(...(page || []))
      hasMore = (page?.length || 0) === PAGE_SIZE
      from += PAGE_SIZE
    }

    const publications = allPublications

    // Build lookup map — the file has EANs, but in ML they are typically
    // stored as sku. Also index by ean, gtin, isbn for broader matching.
    const pubByEan = new Map<string, typeof publications[0]>()
    for (const pub of publications) {
      // Index sku FIRST (highest priority since that's where EANs usually are in ML)
      for (const field of [pub.sku, pub.ean, pub.gtin, pub.isbn]) {
        const normalized = field?.replace(/\D/g, "")
        if (normalized && normalized.length >= 8 && !pubByEan.has(normalized)) {
          pubByEan.set(normalized, pub)
        }
      }
    }

    console.log(`[update-stock-from-url] Found ${publications.length} total publications for account ${account.nickname}, ${pubByEan.size} unique EAN/SKU keys`)

    // --- Match and update ---
    const results: UpdateResult[] = []
    let updated = 0
    let skipped = 0
    let notFound = 0
    let errors = 0

    for (const update of stockUpdates) {
      const pub = pubByEan.get(update.ean)

      if (!pub) {
        notFound++
        continue
      }

      const oldStock = pub.current_stock ?? 0

      // Skip if stock is the same
      if (oldStock === update.stock) {
        skipped++
        results.push({
          ml_item_id: pub.ml_item_id,
          ean: update.ean,
          old_stock: oldStock,
          new_stock: update.stock,
          status: "skipped",
        })
        continue
      }

      if (dry_run) {
        updated++
        results.push({
          ml_item_id: pub.ml_item_id,
          ean: update.ean,
          old_stock: oldStock,
          new_stock: update.stock,
          status: "updated",
        })
        continue
      }

      // --- Actually update ML ---
      try {
        const mlResponse = await fetch(`${ML_API_BASE}/items/${pub.ml_item_id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ available_quantity: update.stock }),
        })

        if (mlResponse.status === 429) {
          // Rate limited - wait and retry once
          await new Promise(r => setTimeout(r, 2000))
          const retryResponse = await fetch(`${ML_API_BASE}/items/${pub.ml_item_id}`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ available_quantity: update.stock }),
          })
          if (!retryResponse.ok) {
            const errText = await retryResponse.text()
            throw new Error(`ML API error after retry: ${retryResponse.status} - ${errText}`)
          }
        } else if (!mlResponse.ok) {
          const errText = await mlResponse.text()
          throw new Error(`ML API error: ${mlResponse.status} - ${errText}`)
        }

        // Update local DB
        await supabase
          .from("ml_publications")
          .update({ current_stock: update.stock, updated_at: new Date().toISOString() })
          .eq("id", pub.id)

        updated++
        results.push({
          ml_item_id: pub.ml_item_id,
          ean: update.ean,
          old_stock: oldStock,
          new_stock: update.stock,
          status: "updated",
        })

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 300))
      } catch (err: any) {
        errors++
        results.push({
          ml_item_id: pub.ml_item_id,
          ean: update.ean,
          old_stock: oldStock,
          new_stock: update.stock,
          status: "error",
          error: err.message,
        })
      }
    }

    const response = {
      dry_run,
      account: account.nickname,
      account_id: account.id,
      file_url: url,
      delimiter: delimiter === "\t" ? "TAB" : delimiter,
      columns: {
        ean: headers[eanColIndex],
        stock: headers[stockColIndex],
      },
      file_eans: stockUpdates.length,
      publications_with_ean: publications?.length || 0,
      summary: { updated, skipped, not_found: notFound, errors },
      parse_errors: parseErrors.length > 0 ? parseErrors.slice(0, 20) : undefined,
      details: results.slice(0, 100), // Limit details to first 100
    }

    console.log(`[update-stock-from-url] Done. Updated: ${updated}, Skipped: ${skipped}, Not found: ${notFound}, Errors: ${errors}`)

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("[update-stock-from-url] Error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}

// --- Helper functions ---

function detectDelimiter(line: string): string {
  const delimiters = ["|", "\t", ";", ","]
  let best = ","
  let maxCount = 0

  for (const d of delimiters) {
    const count = (line.match(new RegExp(d === "|" ? "\\|" : d === "\t" ? "\t" : d, "g")) || []).length
    if (count > maxCount) {
      maxCount = count
      best = d
    }
  }
  return best
}

function detectEanColumn(headers: string[]): number {
  const eanPatterns = [
    /^ean$/i, /^ean13$/i, /^ean_13$/i, /^cod_?barras$/i, /^codigo_?barras$/i,
    /^gtin$/i, /^isbn$/i, /^upc$/i, /^codigo$/i, /^code$/i, /^barcode$/i,
  ]

  for (const pattern of eanPatterns) {
    const idx = headers.findIndex(h => pattern.test(h))
    if (idx !== -1) return idx
  }
  return -1
}

function detectStockColumn(headers: string[]): number {
  const stockPatterns = [
    /^stock$/i, /^cantidad$/i, /^qty$/i, /^quantity$/i, /^disponible$/i,
    /^existencia$/i, /^inventario$/i, /^available$/i, /^cant$/i,
  ]

  for (const pattern of stockPatterns) {
    const idx = headers.findIndex(h => pattern.test(h))
    if (idx !== -1) return idx
  }
  return -1
}
