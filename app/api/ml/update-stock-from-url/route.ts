import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { NextResponse } from "next/server"

export const maxDuration = 300

/**
 * POST /api/ml/update-stock-from-url
 * Descarga un archivo TXT/CSV desde una URL, extrae EAN+stock y actualiza
 * las publicaciones de ML directamente por EAN.
 *
 * Body:
 *   account_id   string  - ID de cuenta ML (uuid) o nickname (ej: "libroide_argentina")
 *   url          string  - URL del archivo de stock (ej: https://mayorista.libroide.com/.../ListadoArgentinafotos.txt)
 *   ean_col      string? - Nombre de columna EAN (default: autodetect)
 *   stock_col    string? - Nombre de columna stock (default: autodetect)
 *   delimiter    string? - Delimitador (default: autodetect)
 *   dry_run      boolean - Solo simular, no actualizar ML (default: false)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      account_id,
      url,
      ean_col,
      stock_col,
      delimiter,
      dry_run = false,
    } = body

    if (!account_id || !url) {
      return NextResponse.json({ error: "account_id y url son requeridos" }, { status: 400 })
    }

    // Buscar cuenta por UUID o por nickname
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account_id)
    const accountQuery = isUuid
      ? supabase.from("ml_accounts").select("*").eq("id", account_id).single()
      : supabase.from("ml_accounts").select("*").ilike("nickname", account_id).single()

    const { data: account, error: accountError } = await accountQuery

    if (accountError || !account) {
      return NextResponse.json({ error: `Cuenta no encontrada: ${account_id}` }, { status: 404 })
    }

    console.log(`[update-stock-from-url] Cuenta: ${account.nickname} (${account.id})`)

    // Obtener token válido (refresca automáticamente si expiró)
    let accessToken: string
    try {
      accessToken = await getValidAccessToken(account.id)
    } catch {
      return NextResponse.json({ error: "Error al obtener token de ML" }, { status: 401 })
    }

    // Descargar archivo
    console.log(`[update-stock-from-url] Descargando: ${url}`)
    const fileRes = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Error descargando archivo: HTTP ${fileRes.status}` },
        { status: 502 }
      )
    }

    // Detectar encoding (Libral usa latin1)
    const buffer = await fileRes.arrayBuffer()
    const decoder = new TextDecoder("latin1")
    const text = decoder.decode(buffer)

    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) {
      return NextResponse.json({ error: "Archivo vacío o sin datos" }, { status: 400 })
    }

    console.log(`[update-stock-from-url] Total líneas: ${lines.length}`)

    // Detectar delimitador
    const firstLine = lines[0]
    const detectedDelimiter = delimiter ?? detectDelimiter(firstLine)
    console.log(`[update-stock-from-url] Delimitador: "${detectedDelimiter === "\t" ? "TAB" : detectedDelimiter}"`)

    const headers = firstLine.split(detectedDelimiter).map((h) => h.trim().replace(/^["']|["']$/g, "").toLowerCase())
    console.log(`[update-stock-from-url] Columnas: ${headers.join(", ")}`)

    // Detectar columnas EAN y stock
    const resolvedEanCol = ean_col?.toLowerCase() ?? findColumn(headers, ["ean", "isbn", "gtin", "codigo", "code"])
    const resolvedStockCol = stock_col?.toLowerCase() ?? findColumn(headers, ["stock", "cantidad", "qty", "quantity", "disponible"])

    if (!resolvedEanCol) {
      return NextResponse.json({
        error: "No se encontró columna EAN",
        headers,
        hint: "Pasá ean_col en el body con el nombre exacto de la columna",
      }, { status: 400 })
    }
    if (!resolvedStockCol) {
      return NextResponse.json({
        error: "No se encontró columna stock",
        headers,
        hint: "Pasá stock_col en el body con el nombre exacto de la columna",
      }, { status: 400 })
    }

    const eanIdx = headers.indexOf(resolvedEanCol)
    const stockIdx = headers.indexOf(resolvedStockCol)

    console.log(`[update-stock-from-url] EAN col: "${resolvedEanCol}" (idx ${eanIdx}), Stock col: "${resolvedStockCol}" (idx ${stockIdx})`)

    // Parsear EAN → stock del archivo
    const fileStockMap: Record<string, number> = {}
    let parseErrors = 0

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(detectedDelimiter)
      const rawEan = cols[eanIdx]?.trim().replace(/^["']|["']$/g, "")
      const rawStock = cols[stockIdx]?.trim().replace(/^["']|["']$/g, "")
      if (!rawEan) continue
      const ean = normalizeEan(rawEan)
      const stock = parseInt(rawStock ?? "0", 10)
      if (isNaN(stock)) { parseErrors++; continue }
      fileStockMap[ean] = stock
    }

    const totalInFile = Object.keys(fileStockMap).length
    console.log(`[update-stock-from-url] EANs en archivo: ${totalInFile} (parse errors: ${parseErrors})`)

    // Obtener publicaciones de la cuenta con EAN
    const { data: publications, error: pubError } = await supabase
      .from("ml_publications")
      .select("ml_item_id, ean, current_stock")
      .eq("account_id", account.id)
      .not("ean", "is", null)

    if (pubError) {
      return NextResponse.json({ error: "Error al obtener publicaciones" }, { status: 500 })
    }

    console.log(`[update-stock-from-url] Publicaciones con EAN: ${publications?.length ?? 0}`)

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    }

    let updated = 0
    let skipped = 0
    let not_found = 0
    let errors = 0

    for (const pub of publications ?? []) {
      const ean = normalizeEan(pub.ean)
      const newStock = fileStockMap[ean]

      if (newStock === undefined) {
        not_found++
        continue
      }

      if (newStock === pub.current_stock) {
        skipped++
        continue
      }

      if (dry_run) {
        updated++
        continue
      }

      try {
        const res = await fetch(`https://api.mercadolibre.com/items/${pub.ml_item_id}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ available_quantity: newStock }),
          signal: AbortSignal.timeout(10_000),
        })

        if (res.ok) {
          await supabase
            .from("ml_publications")
            .update({ current_stock: newStock, updated_at: new Date().toISOString() })
            .eq("account_id", account.id)
            .eq("ml_item_id", pub.ml_item_id)
          updated++
        } else if (res.status === 429) {
          return NextResponse.json({
            success: false,
            rate_limited: true,
            updated,
            skipped,
            not_found,
            errors,
            message: "Rate limit de ML. Esperá unos minutos y reiniciá.",
          })
        } else {
          const err = await res.json().catch(() => ({}))
          console.error(`[update-stock-from-url] Error ML ${pub.ml_item_id}:`, err)
          errors++
        }
      } catch (e) {
        console.error(`[update-stock-from-url] Timeout/error ${pub.ml_item_id}:`, e)
        errors++
      }

      // 200ms entre requests para no saturar ML
      await new Promise((r) => setTimeout(r, 200))
    }

    if (!dry_run) {
      await supabase
        .from("ml_accounts")
        .update({ last_stock_sync_at: new Date().toISOString() })
        .eq("id", account.id)
    }

    return NextResponse.json({
      success: true,
      dry_run,
      account: account.nickname,
      file_eans: totalInFile,
      publications_with_ean: publications?.length ?? 0,
      updated,
      skipped,
      not_found,
      errors,
      parse_errors: parseErrors,
      ean_col: resolvedEanCol,
      stock_col: resolvedStockCol,
    })
  } catch (error) {
    console.error("[update-stock-from-url] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}

function detectDelimiter(line: string): string {
  const candidates = ["\t", ";", "|", ","]
  let best = "\t"
  let bestCount = 0
  for (const c of candidates) {
    const count = line.split(c).length - 1
    if (count > bestCount) {
      bestCount = count
      best = c
    }
  }
  return best
}

function findColumn(headers: string[], candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (headers.includes(c)) return c
  }
  return undefined
}

function normalizeEan(raw: string): string {
  return raw.replace(/\D/g, "").padStart(13, "0").slice(-13)
}
