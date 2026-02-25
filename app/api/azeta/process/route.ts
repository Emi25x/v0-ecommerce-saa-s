import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { del } from "@vercel/blob"

export const dynamic = "force-dynamic"

// Cuantas lineas CSV procesar por llamada (ajustable segun tiempo de respuesta)
const LINES_PER_CALL = 5000

// Column mapping exacto de Azeta Total segun seed
const COL_MAP: Record<string, string[]> = {
  ean:       ["ean", "isbn"],
  title:     ["titulo"],
  author:    ["autor"],
  publisher: ["editorial"],
  price:     ["precio"],
  binding:   ["encuadernacion"],
  language:  ["idioma"],
  pages:     ["num pag", "num_pag", "paginas"],
  width:     ["ancho"],
  height:    ["alto"],
  weight:    ["peso"],
  pub_date:  ["fecha de edicion", "fecha_de_edicion"],
}

function normalizeEan(raw: string): string {
  if (!raw) return ""
  let s = String(raw).trim().replace(/['"]/g, "")
  // Notacion cientifica de Excel: 9.78845E+12
  if (/^[0-9]+\.?[0-9]*[eE][+\-]?[0-9]+$/.test(s)) {
    s = Math.round(Number(s)).toString()
  }
  s = s.replace(/[^0-9]/g, "")
  if (!s) return ""
  if (s.length === 10) s = "978" + s  // ISBN-10 → ISBN-13
  return s.length <= 13 ? s.padStart(13, "0") : s
}

function col(cols: string[], idx: number): string | null {
  if (idx < 0 || idx >= cols.length) return null
  const v = cols[idx].replace(/['"]/g, "").trim()
  return v || null
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "azeta-process" })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { blob_url, offset = 0, cleanup = false } = body

  if (!blob_url) {
    return NextResponse.json({ error: "blob_url requerido" }, { status: 400 })
  }

  // Cleanup: borrar blob al terminar
  if (cleanup) {
    try { await del(blob_url) } catch {}
    return NextResponse.json({ ok: true, cleaned: true })
  }

  const startTime = Date.now()
  console.log(`[AZETA-PROC] offset=${offset} blob=${blob_url.slice(-40)}`)

  try {
    // Descargar ZIP desde Blob
    const zipRes = await fetch(blob_url)
    if (!zipRes.ok) return NextResponse.json({ error: `Error fetching blob: ${zipRes.status}` }, { status: 502 })

    const chunks: Uint8Array[] = []
    const reader = zipRes.body!.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0)
    const zipBuf = new Uint8Array(totalLen)
    let pos = 0
    for (const c of chunks) { zipBuf.set(c, pos); pos += c.length }
    console.log(`[AZETA-PROC] ZIP descargado: ${(zipBuf.length / 1024 / 1024).toFixed(1)}MB`)

    // Extraer CSV del ZIP
    const csvText = await extractCSVFromZip(zipBuf)
    console.log(`[AZETA-PROC] CSV: ${(csvText.length / 1024 / 1024).toFixed(1)}MB`)

    // Detectar delimitador y headers
    const firstNewline = csvText.indexOf("\n")
    const firstLine = csvText.substring(0, firstNewline).trim()
    const pipeCount = (firstLine.match(/\|/g) || []).length
    const delimiter = pipeCount > 0 ? "|" : ";"

    const rawHeaders = firstLine.split(delimiter).map(h => h.replace(/['"]/g, "").trim().toLowerCase())
    console.log(`[AZETA-PROC] delimiter="${delimiter}" headers[0..5]=${rawHeaders.slice(0, 6).join(",")}`)

    // Resolver indices de columnas
    const idx: Record<string, number> = {}
    for (const [field, aliases] of Object.entries(COL_MAP)) {
      idx[field] = rawHeaders.findIndex(h => aliases.includes(h))
    }
    // EAN puede estar en "ean" o "isbn"
    const eanIdx = rawHeaders.findIndex(h => h === "ean" || h === "isbn")
    if (eanIdx < 0) {
      return NextResponse.json({ error: `Columna EAN no encontrada. Headers: ${rawHeaders.slice(0, 8).join(",")}` }, { status: 500 })
    }

    // Partir en lineas y procesar el slice correspondiente
    const lines = csvText.split("\n")
    const dataStart = 1 // Siempre hay header en Azeta
    const totalDataLines = lines.length - dataStart
    const sliceStart = dataStart + offset
    const sliceEnd = Math.min(sliceStart + LINES_PER_CALL, lines.length)
    const done = sliceEnd >= lines.length

    console.log(`[AZETA-PROC] Procesando lineas ${sliceStart}..${sliceEnd} de ${lines.length} total`)

    const products: any[] = []
    let discarded = 0

    for (let i = sliceStart; i < sliceEnd; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const cols = line.split(delimiter)

      const rawEan = cols[eanIdx]?.replace(/['"]/g, "").trim() || ""
      const ean = normalizeEan(rawEan)
      if (!ean || (ean.length !== 13 && ean.length !== 8)) { discarded++; continue }

      const priceStr = idx.price >= 0 ? col(cols, idx.price) : null
      products.push({
        sku:          ean,
        ean,
        title:        col(cols, idx.title),
        author:       col(cols, idx.author),
        brand:        col(cols, idx.publisher),  // publisher → brand en products
        cost_price:   priceStr ? parseFloat(priceStr.replace(",", ".")) || null : null,
        language:     col(cols, idx.language),
        binding:      col(cols, idx.binding),
      })
    }

    console.log(`[AZETA-PROC] validos=${products.length} descartados=${discarded}`)

    // Upsert en Supabase en sub-batches de 500
    const supabase = createAdminClient()
    let created = 0, updated = 0, errors = 0

    // Pre-fetch EANs existentes para este batch
    const batchEans = products.map(p => p.ean)
    const existingSet = new Set<string>()
    if (batchEans.length > 0) {
      for (let i = 0; i < batchEans.length; i += 1000) {
        const { data } = await supabase.from("products").select("ean").in("ean", batchEans.slice(i, i + 1000))
        ;(data || []).forEach((r: any) => existingSet.add(r.ean))
      }
    }

    for (let i = 0; i < products.length; i += 500) {
      const batch = products.slice(i, i + 500)
      const { error } = await supabase.from("products").upsert(batch, { onConflict: "ean" })
      if (error) {
        console.error(`[AZETA-PROC] upsert error: ${error.message}`)
        errors += batch.length
      } else {
        for (const p of batch) {
          existingSet.has(p.ean) ? updated++ : created++
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA-PROC] Lote done=${done} created=${created} updated=${updated} errors=${errors} en ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      done,
      offset,
      next_offset: done ? null : offset + LINES_PER_CALL,
      rows_processed: products.length + discarded,
      created,
      updated,
      errors,
      discarded,
      total_lines: totalDataLines,
      elapsed_seconds: parseFloat(elapsed),
    })

  } catch (err: any) {
    console.error("[AZETA-PROC] Error fatal:", err.message, err.stack?.slice(0, 300))
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Extrae el primer CSV/TXT de un ZIP usando inflate raw (method 8) o stored (method 0)
async function extractCSVFromZip(buf: Uint8Array): Promise<string> {
  let off = 0
  while (off < buf.length - 30) {
    if (buf[off] === 0x50 && buf[off+1] === 0x4b && buf[off+2] === 0x03 && buf[off+3] === 0x04) {
      const method = buf[off+8] | (buf[off+9] << 8)
      const compressedSize = (buf[off+18] | (buf[off+19] << 8) | (buf[off+20] << 16) | (buf[off+21] << 24)) >>> 0
      const fileNameLen = buf[off+26] | (buf[off+27] << 8)
      const extraLen = buf[off+28] | (buf[off+29] << 8)
      const fileName = new TextDecoder().decode(buf.subarray(off+30, off+30+fileNameLen))
      console.log(`[ZIP] entry="${fileName}" method=${method} compressed=${(compressedSize/1024/1024).toFixed(1)}MB`)

      if (/\.(csv|txt)$/i.test(fileName)) {
        const dataStart = off + 30 + fileNameLen + extraLen
        const compressed = buf.subarray(dataStart, dataStart + compressedSize)

        if (method === 0) {
          return new TextDecoder("latin1").decode(compressed)
        } else if (method === 8) {
          const { inflateRawSync } = await import("zlib")
          const decompressed = inflateRawSync(Buffer.from(compressed))
          return new TextDecoder("latin1").decode(decompressed)
        } else {
          throw new Error(`ZIP method ${method} no soportado`)
        }
      }
      off += 30 + fileNameLen + extraLen + compressedSize
      continue
    }
    off++
  }
  throw new Error("No se encontro CSV/TXT en el ZIP")
}
