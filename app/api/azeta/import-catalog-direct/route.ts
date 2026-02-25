import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 300

// GET de diagnóstico — confirma que el endpoint está registrado correctamente
export async function GET() {
  return NextResponse.json({ ok: true, route: "azeta-import-catalog-direct", ts: Date.now() })
}

function normalizeEan(raw: string): string {
  if (!raw) return ""
  const cleaned = raw.replace(/[^0-9]/g, "")
  if (!cleaned) return ""
  return cleaned.padStart(13, "0")
}

// Leer uint32 little-endian desde un Uint8Array
function readUInt32LE(buf: Uint8Array, offset: number): number {
  return (
    buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24)
  ) >>> 0
}

function readUInt16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8)
}

// Descomprimir deflate raw usando DecompressionStream (Web API nativa — sin dependencias)
async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw")
  const writer = ds.writable.getWriter()
  const reader = ds.readable.getReader()

  writer.write(compressed)
  writer.close()

  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }

  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) { out.set(c, pos); pos += c.length }
  return out
}

async function extractCSVFromZip(zipBuffer: Uint8Array): Promise<string> {
  let offset = 0
  while (offset < zipBuffer.length - 30) {
    // Buscar signature 0x04034b50 (PK local file header)
    if (
      zipBuffer[offset]     === 0x50 &&
      zipBuffer[offset + 1] === 0x4b &&
      zipBuffer[offset + 2] === 0x03 &&
      zipBuffer[offset + 3] === 0x04
    ) {
      const compressionMethod = readUInt16LE(zipBuffer, offset + 8)
      const compressedSize    = readUInt32LE(zipBuffer, offset + 18)
      const fileNameLength    = readUInt16LE(zipBuffer, offset + 26)
      const extraFieldLength  = readUInt16LE(zipBuffer, offset + 28)

      const fileNameBytes = zipBuffer.subarray(offset + 30, offset + 30 + fileNameLength)
      const fileName = new TextDecoder().decode(fileNameBytes)
      console.log(`[AZETA] ZIP entry: "${fileName}" method:${compressionMethod} compressedSize:${compressedSize}`)

      if (fileName.toLowerCase().match(/\.(csv|txt)$/)) {
        const dataStart = offset + 30 + fileNameLength + extraFieldLength
        const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize)

        let decompressed: Uint8Array
        if (compressionMethod === 0) {
          // Sin compresión
          decompressed = compressedData
        } else if (compressionMethod === 8) {
          // Deflate — usar DecompressionStream nativo (no deps)
          decompressed = await inflateRaw(compressedData)
        } else {
          throw new Error(`Compression method ${compressionMethod} not supported`)
        }

        // latin1 para caracteres españoles
        return new TextDecoder("latin1").decode(decompressed)
      }

      // Saltar al siguiente entry
      offset += 30 + fileNameLength + extraFieldLength + compressedSize
    } else {
      offset++
    }
  }
  throw new Error("No se encontró archivo CSV/TXT en el ZIP")
}

export async function POST(_request: NextRequest) {
  const startTime = Date.now()
  console.log("[AZETA] === Inicio importación catálogo AZETA Total ===")

  try {
    const url = "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"

    console.log(`[AZETA][FETCH] method=GET url=${url}`)
    const res = await fetch(url, { method: "GET" })

    console.log(`[AZETA][FETCH] status=${res.status} content-type=${res.headers.get("content-type")} allow=${res.headers.get("allow") ?? "none"}`)

    if (!res.ok) {
      const preview = await res.text().then(t => t.substring(0, 200)).catch(() => "")
      console.error(`[AZETA][FETCH] error body: ${preview}`)
      return NextResponse.json({ error: `Error ${res.status} del servidor AZETA`, body_preview: preview }, { status: 502 })
    }

    // Descargar en streaming — sin arrayBuffer() para evitar límite de memoria
    const chunks: Uint8Array[] = []
    const reader = res.body!.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0)
    const fileBuffer = new Uint8Array(totalLen)
    let pos = 0
    for (const c of chunks) { fileBuffer.set(c, pos); pos += c.length }

    console.log(`[AZETA] Descargado: ${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB en ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

    // Detectar ZIP por magic bytes PK (0x50 0x4B)
    const isZip = fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b
    console.log(`[AZETA] Formato: ${isZip ? "ZIP" : "CSV directo"}`)

    let csvText: string
    if (isZip) {
      csvText = await extractCSVFromZip(fileBuffer)
    } else {
      csvText = new TextDecoder("latin1").decode(fileBuffer)
    }
    console.log(`[AZETA] CSV: ${(csvText.length / 1024 / 1024).toFixed(1)}MB extraído en ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

    // Detectar delimitador y parsear headers
    const firstNewline = csvText.indexOf("\n")
    const headerLine = csvText.substring(0, firstNewline).trim().replace(/^["']|["']$/g, "")
    const pipeCount = (headerLine.match(/\|/g) || []).length
    const semicolonCount = (headerLine.match(/;/g) || []).length
    const delimiter = pipeCount >= semicolonCount ? "|" : ";"
    const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, ""))
    console.log(`[AZETA] Delimitador="${delimiter}" Headers(10): ${headers.slice(0, 10).join(", ")}`)

    const idx = {
      ean:      headers.findIndex(h => h === "ean" || h === "isbn"),
      titulo:   headers.findIndex(h => h === "titulo" || h === "title"),
      autor:    headers.findIndex(h => h === "autor" || h === "author"),
      editorial:headers.findIndex(h => h === "editorial" || h === "publisher"),
      pvp:      headers.findIndex(h => h === "pvp" || h === "precio"),
      idioma:   headers.findIndex(h => h === "idioma" || h === "language"),
      sinopsis: headers.findIndex(h => h.includes("sinopsis") || h === "descripcion"),
      url:      headers.findIndex(h => h === "url" || h === "imagen" || h === "portada"),
      ano:      headers.findIndex(h => h.includes("ano_edicion") || h.includes("year")),
      codigo:   headers.findIndex(h => h === "codigo_interno"),
    }

    if (idx.ean < 0) {
      return NextResponse.json({ error: `Columna EAN no encontrada. Headers: ${headers.slice(0, 10).join(", ")}` }, { status: 500 })
    }

    // Parsear líneas y deduplicar por EAN
    const lines = csvText.split("\n")
    const productMap = new Map<string, any>()

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const cols = line.split(delimiter)
      if (cols.length <= idx.ean) continue

      const ean = normalizeEan(cols[idx.ean]?.replace(/['"]/g, "").trim())
      if (!ean || ean.length !== 13) continue

      const col = (ci: number) => ci >= 0 && cols[ci] ? cols[ci].replace(/['"]/g, "").trim() || null : null
      const priceStr = col(idx.pvp)
      const cost_price = priceStr ? parseFloat(priceStr.replace(",", ".")) || null : null

      productMap.set(ean, {
        sku: ean,
        ean,
        title:         col(idx.titulo),
        author:        col(idx.autor),
        brand:         col(idx.editorial),
        cost_price,
        language:      col(idx.idioma),
        description:   col(idx.sinopsis),
        image_url:     col(idx.url),
        year_edition:  col(idx.ano),
        internal_code: col(idx.codigo),
      })
    }

    const allProducts = Array.from(productMap.values())
    console.log(`[AZETA] ${allProducts.length} productos únicos de ${lines.length - 1} líneas`)

    const supabase = createAdminClient()

    // Detectar existentes (primer 10k) para contar created vs updated
    const firstBatchEans = allProducts.slice(0, 10000).map(p => p.ean)
    const { data: existing } = await supabase.from("products").select("ean").in("ean", firstBatchEans)
    const existingSet = new Set((existing || []).map((r: any) => r.ean))

    // Upsert en batches de 500
    const BATCH = 500
    let created = 0, updated = 0, errors = 0

    for (let i = 0; i < allProducts.length; i += BATCH) {
      const batch = allProducts.slice(i, i + BATCH)
      const { error } = await supabase.from("products").upsert(batch, { onConflict: "ean" })

      if (error) {
        console.error(`[AZETA] Error batch ${i}: ${error.message}`)
        errors += batch.length
      } else {
        for (const p of batch) {
          existingSet.has(p.ean) ? updated++ : created++
        }
      }

      if (i % 5000 === 0) {
        console.log(`[AZETA] Progreso: ${i + batch.length}/${allProducts.length} — ${created} creados, ${updated} actualizados`)
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA] === Completado: ${created} creados, ${updated} actualizados, ${errors} errores en ${elapsed}s ===`)

    return NextResponse.json({ success: true, created, updated, errors, total_rows: allProducts.length, elapsed_seconds: parseFloat(elapsed) })

  } catch (err: any) {
    console.error("[AZETA] Error fatal:", err.message, err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
