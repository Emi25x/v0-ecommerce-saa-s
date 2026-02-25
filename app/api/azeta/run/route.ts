import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ ok: true, route: "azeta-run-v1" })
}

export async function POST(_request: NextRequest) {
  const startTime = Date.now()
  console.log("[AZETA] === Inicio importacion catalogo ===")

  function normalizeEan(raw: string): string {
    if (!raw) return ""
    let s = String(raw).trim()
    if (/^[0-9]+\.?[0-9]*[eE][+\-][0-9]+$/.test(s)) s = Number(s).toFixed(0)
    s = s.replace(/[^0-9]/g, "")
    if (!s) return ""
    if (s.length === 10) s = "978" + s
    return s.padStart(13, "0")
  }

  async function extractCSVFromZip(buf: Uint8Array): Promise<string> {
    let off = 0
    while (off < buf.length - 30) {
      if (buf[off] === 0x50 && buf[off+1] === 0x4b && buf[off+2] === 0x03 && buf[off+3] === 0x04) {
        const method         = buf[off+8]  | (buf[off+9]  << 8)
        const compressedSize = (buf[off+18] | (buf[off+19] << 8) | (buf[off+20] << 16) | (buf[off+21] << 24)) >>> 0
        const fileNameLen    = buf[off+26] | (buf[off+27] << 8)
        const extraLen       = buf[off+28] | (buf[off+29] << 8)
        const fileName       = new TextDecoder().decode(buf.subarray(off+30, off+30+fileNameLen))
        console.log(`[AZETA][ZIP] entry="${fileName}" method=${method} size=${compressedSize}`)

        if (/\.(csv|txt)$/i.test(fileName)) {
          const dataStart = off + 30 + fileNameLen + extraLen
          const compressed = buf.subarray(dataStart, dataStart + compressedSize)
          let decompressed: Uint8Array
          if (method === 0) {
            decompressed = compressed
          } else if (method === 8) {
            const zlib = require("zlib")
            decompressed = zlib.inflateRawSync(Buffer.from(compressed))
          } else {
            throw new Error(`ZIP method ${method} not supported`)
          }
          return new TextDecoder("latin1").decode(decompressed)
        }
        off += 30 + fileNameLen + extraLen + compressedSize
        continue
      }
      off++
    }
    throw new Error("No se encontro CSV/TXT en el ZIP")
  }

  try {
    const url = "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"
    console.log(`[AZETA][FETCH] GET ${url}`)
    const res = await fetch(url, { method: "GET" })
    console.log(`[AZETA][FETCH] status=${res.status} content-type=${res.headers.get("content-type")}`)

    if (!res.ok) {
      const preview = await res.text().then(t => t.slice(0, 200)).catch(() => "")
      return NextResponse.json({ error: `Error ${res.status} servidor AZETA`, preview }, { status: 502 })
    }

    const chunks: Uint8Array[] = []
    const reader = res.body!.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0)
    const fileBuf = new Uint8Array(totalLen)
    let pos = 0
    for (const c of chunks) { fileBuf.set(c, pos); pos += c.length }
    console.log(`[AZETA] Descargado: ${(fileBuf.length/1024/1024).toFixed(1)}MB en ${((Date.now()-startTime)/1000).toFixed(1)}s`)

    const isZip = fileBuf[0] === 0x50 && fileBuf[1] === 0x4b
    console.log(`[AZETA] Formato: ${isZip ? "ZIP" : "CSV"}`)

    let csvText: string
    if (isZip) {
      csvText = await extractCSVFromZip(fileBuf)
    } else {
      csvText = new TextDecoder("latin1").decode(fileBuf)
    }
    console.log(`[AZETA] CSV: ${(csvText.length/1024/1024).toFixed(1)}MB`)

    const firstLine = csvText.substring(0, csvText.indexOf("\n")).trim()
    const pipeCount = (firstLine.match(/\|/g) || []).length
    const semiCount = (firstLine.match(/;/g) || []).length
    const delimiter = pipeCount >= semiCount ? "|" : ";"
    const rawHeaders = firstLine.split(delimiter).map(h => h.trim().replace(/['"]/g, "").toLowerCase())
    console.log(`[AZETA][CSV] delimiter="${delimiter}" headers=${rawHeaders.slice(0,10).join(",")}`)

    const firstColNumeric = /^[0-9eE.+\-]+$/.test(rawHeaders[0])
    const headers = firstColNumeric ? [] : rawHeaders
    const hasHeader = headers.length > 0

    const colIdx = {
      ean:       hasHeader ? headers.findIndex(h => ["ean","isbn","gtin"].includes(h)) : 0,
      titulo:    hasHeader ? headers.findIndex(h => ["titulo","title"].includes(h)) : -1,
      autor:     hasHeader ? headers.findIndex(h => ["autor","author"].includes(h)) : -1,
      editorial: hasHeader ? headers.findIndex(h => ["editorial","publisher"].includes(h)) : -1,
      pvp:       hasHeader ? headers.findIndex(h => ["pvp","precio","precio_sin_iva"].includes(h)) : -1,
      idioma:    hasHeader ? headers.findIndex(h => ["idioma","language"].includes(h)) : -1,
      sinopsis:  hasHeader ? headers.findIndex(h => h.includes("sinopsis") || h === "descripcion") : -1,
      url:       hasHeader ? headers.findIndex(h => ["url","imagen","portada"].includes(h)) : -1,
      ano:       hasHeader ? headers.findIndex(h => h.includes("ano_edicion") || h.includes("year")) : -1,
      codigo:    hasHeader ? headers.findIndex(h => h === "codigo_interno") : -1,
    }

    if (colIdx.ean < 0) {
      return NextResponse.json({ error: `Columna EAN no encontrada. Headers: ${headers.slice(0,10).join(",")}` }, { status: 500 })
    }

    const lines = csvText.split("\n")
    const productMap = new Map<string, any>()
    let discarded = 0

    for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const cols = line.split(delimiter)
      if (cols.length <= colIdx.ean) continue
      const ean = normalizeEan(cols[colIdx.ean]?.replace(/['"]/g, "").trim())
      if (!ean || ean.length !== 13) { discarded++; continue }
      const col = (ci: number) => ci >= 0 && cols[ci] ? cols[ci].replace(/['"]/g, "").trim() || null : null
      const priceStr = col(colIdx.pvp)
      productMap.set(ean, {
        sku: ean, ean,
        title:         col(colIdx.titulo),
        author:        col(colIdx.autor),
        brand:         col(colIdx.editorial),
        cost_price:    priceStr ? parseFloat(priceStr.replace(",", ".")) || null : null,
        language:      col(colIdx.idioma),
        description:   col(colIdx.sinopsis),
        image_url:     col(colIdx.url),
        year_edition:  col(colIdx.ano),
        internal_code: col(colIdx.codigo),
      })
    }

    const products = Array.from(productMap.values())
    console.log(`[AZETA][IMPORT] validos=${products.length} descartados=${discarded}`)

    const supabase = createAdminClient()
    const allEans = products.map(p => p.ean)
    const existingSet = new Set<string>()
    for (let i = 0; i < allEans.length; i += 5000) {
      const { data } = await supabase.from("products").select("ean").in("ean", allEans.slice(i, i+5000))
      ;(data || []).forEach((r: any) => existingSet.add(r.ean))
    }

    let created = 0, updated = 0, errors = 0
    for (let i = 0; i < products.length; i += 500) {
      const batch = products.slice(i, i+500)
      const { error } = await supabase.from("products").upsert(batch, { onConflict: "ean" })
      if (error) { console.error(`[AZETA][UPSERT] error: ${error.message}`); errors += batch.length }
      else { for (const p of batch) existingSet.has(p.ean) ? updated++ : created++ }
      if (i % 10000 === 0) console.log(`[AZETA][UPSERT] ${i+batch.length}/${products.length}`)
    }

    const elapsed = ((Date.now()-startTime)/1000).toFixed(1)
    console.log(`[AZETA] Completado: creados=${created} actualizados=${updated} errores=${errors} en ${elapsed}s`)
    return NextResponse.json({ success: true, created, updated, errors, total_rows: products.length, elapsed_seconds: parseFloat(elapsed) })

  } catch (err: any) {
    console.error("[AZETA] Error fatal:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
