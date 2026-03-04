import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { del } from "@vercel/blob"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Lineas a procesar por llamada
const LINES_PER_CALL = 3000

// Column mapping Azeta Total (delimitador pipe)
const COL_MAP: Record<string, string[]> = {
  ean:       ["ean", "isbn"],
  title:     ["titulo"],
  author:    ["autor"],
  publisher: ["editorial"],
  price:     ["precio"],
  binding:   ["encuadernacion"],
  language:  ["idioma"],
  pages:     ["num pag", "num_pag", "paginas"],
}

function normalizeEan(raw: string): string {
  if (!raw) return ""
  let s = String(raw).trim().replace(/['"]/g, "")
  if (/^[0-9]+\.?[0-9]*[eE][+\-]?[0-9]+$/.test(s)) s = Math.round(Number(s)).toString()
  s = s.replace(/[^0-9]/g, "")
  if (!s) return ""
  if (s.length === 10) s = "978" + s
  return s.length <= 13 ? s.padStart(13, "0") : s
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "azeta-process-v2" })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { blob_url, byte_start = 0, total_lines, header_line, cleanup = false } = body

  if (!blob_url) return NextResponse.json({ error: "blob_url requerido" }, { status: 400 })

  // Cleanup: borrar blob al terminar
  if (cleanup) {
    try { await del(blob_url) } catch {}
    return NextResponse.json({ ok: true, cleaned: true })
  }

  const startTime = Date.now()
  const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB por llamada

  try {
    // Fetch parcial con Range bytes
    const rangeEnd = byte_start + CHUNK_SIZE - 1
    console.log(`[AZETA-PROC] Range bytes=${byte_start}-${rangeEnd}`)

    const fetchRes = await fetch(blob_url, {
      headers: { Range: `bytes=${byte_start}-${rangeEnd}` },
    })

    // 206 = partial content, 200 = servidor no soporta range (devuelve todo)
    console.log(`[AZETA-PROC] fetch status=${fetchRes.status} content-range=${fetchRes.headers.get("content-range")}`)

    const chunkText = await fetchRes.text()
    const contentRange = fetchRes.headers.get("content-range") || ""

    // Detectar si hay mas datos
    // content-range: bytes 0-4194303/52428800
    let totalBytes: number | null = null
    const crMatch = contentRange.match(/\/(\d+)$/)
    if (crMatch) totalBytes = parseInt(crMatch[1])
    const isLastChunk = fetchRes.status === 200 || (totalBytes !== null && rangeEnd >= totalBytes - 1)

    // Parsear lineas del chunk
    // El chunk puede empezar en medio de una linea — la primera linea incompleta va a ser descartada
    // excepto en el primer chunk (byte_start=0)
    let lines = chunkText.split("\n")

    // En el primer chunk: primera linea es el header
    let headerCols: string[]
    if (byte_start === 0) {
      headerCols = lines[0].split("|").map(h => h.replace(/['"]/g, "").trim().toLowerCase())
      lines = lines.slice(1) // sacar el header
    } else {
      // El header viene en el body
      if (!header_line) return NextResponse.json({ error: "header_line requerido para offset > 0" }, { status: 400 })
      headerCols = header_line.split("|").map((h: string) => h.replace(/['"]/g, "").trim().toLowerCase())
      lines = lines.slice(1) // descartar primera linea (incompleta)
    }

    // La ultima linea puede estar incompleta — calcular el byte donde termina la penultima \n
    const lastNewlineIdx = chunkText.lastIndexOf("\n")
    const next_byte_start = byte_start + Buffer.byteLength(chunkText.substring(0, lastNewlineIdx + 1), "utf8")
    lines = lines.slice(0, lines.length - 1) // sacar la ultima linea (incompleta)

    console.log(`[AZETA-PROC] header=${headerCols.slice(0,5).join(",")} lineas_en_chunk=${lines.length}`)

    // Resolver indices
    const idx: Record<string, number> = {}
    for (const [field, aliases] of Object.entries(COL_MAP)) {
      idx[field] = headerCols.findIndex(h => aliases.includes(h))
    }
    const eanIdx = headerCols.findIndex(h => h === "ean" || h === "isbn")
    if (eanIdx < 0) return NextResponse.json({ error: `EAN no encontrado. Headers: ${headerCols.slice(0,8).join(",")}` }, { status: 500 })

    // Construir productos
    const products: any[] = []
    let discarded = 0
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const cols = trimmed.split("|")
      const rawEan = cols[eanIdx]?.replace(/['"]/g, "").trim() || ""
      const ean = normalizeEan(rawEan)
      if (!ean || (ean.length !== 13 && ean.length !== 8)) { discarded++; continue }
      const priceStr = idx.price >= 0 ? (cols[idx.price] || "").replace(/['"]/g, "").trim() : ""
      products.push({
        sku: ean, ean,
        title:      idx.title >= 0     ? (cols[idx.title]     || "").replace(/['"]/g,"").trim() || null : null,
        author:     idx.author >= 0    ? (cols[idx.author]    || "").replace(/['"]/g,"").trim() || null : null,
        brand:      idx.publisher >= 0 ? (cols[idx.publisher] || "").replace(/['"]/g,"").trim() || null : null,
        cost_price: priceStr ? parseFloat(priceStr.replace(",", ".")) || null : null,
        language:   idx.language >= 0  ? (cols[idx.language]  || "").replace(/['"]/g,"").trim() || null : null,
      })
    }

    console.log(`[AZETA-PROC] validos=${products.length} descartados=${discarded}`)

    // Upsert en Supabase batches de 500
    const supabase = createAdminClient()
    let created = 0, updated = 0, errors = 0

    // Pre-fetch EANs existentes
    const batchEans = products.map(p => p.ean)
    const existingSet = new Set<string>()
    for (let i = 0; i < batchEans.length; i += 1000) {
      const { data } = await supabase.from("products").select("ean").in("ean", batchEans.slice(i, i+1000))
      ;(data||[]).forEach((r: any) => existingSet.add(r.ean))
    }

    for (let i = 0; i < products.length; i += 500) {
      const batch = products.slice(i, i+500)
      const { error } = await supabase.from("products").upsert(batch, { onConflict: "ean" })
      if (error) { console.error(`[AZETA-PROC] upsert error: ${error.message}`); errors += batch.length }
      else { for (const p of batch) existingSet.has(p.ean) ? updated++ : created++ }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA-PROC] done=${isLastChunk} created=${created} updated=${updated} en ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      done: isLastChunk,
      next_byte_start: isLastChunk ? null : next_byte_start,
      header_line: headerCols.join("|"),
      rows_processed: products.length + discarded,
      created, updated, errors, discarded,
      total_lines: total_lines || null,
      elapsed_seconds: parseFloat(elapsed),
    })
  } catch (err: any) {
    console.error("[AZETA-PROC] Error fatal:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
