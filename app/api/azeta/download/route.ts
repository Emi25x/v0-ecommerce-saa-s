import { NextResponse } from "next/server"
import { put, del, list } from "@vercel/blob"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET() {
  return NextResponse.json({ ok: true, route: "azeta-download-v2" })
}

export async function POST() {
  const startTime = Date.now()
  const url = "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"

  try {
    // 1. Descargar ZIP
    console.log("[AZETA-DL] Descargando ZIP...")
    const res = await fetch(url)
    console.log(`[AZETA-DL] status=${res.status} content-length=${res.headers.get("content-length")}`)

    if (!res.ok) {
      const preview = await res.text().then(t => t.slice(0, 200)).catch(() => "")
      return NextResponse.json({ error: `Error ${res.status} AZETA`, preview }, { status: 502 })
    }

    // Leer ZIP en memoria via stream
    const chunks: Uint8Array[] = []
    const reader = res.body!.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0)
    const zipBuf = new Uint8Array(totalLen)
    let pos = 0
    for (const c of chunks) { zipBuf.set(c, pos); pos += c.length }
    console.log(`[AZETA-DL] ZIP: ${(zipBuf.length / 1024 / 1024).toFixed(1)}MB en ${((Date.now()-startTime)/1000).toFixed(1)}s`)

    // 2. Extraer y descomprimir CSV del ZIP
    const csvText = await extractCSVFromZip(zipBuf)
    console.log(`[AZETA-DL] CSV descomprimido: ${(csvText.length / 1024 / 1024).toFixed(1)}MB`)

    // 3. Borrar blobs anteriores
    try {
      const { blobs } = await list({ prefix: "azeta-catalog/" })
      await Promise.all(blobs.map(b => del(b.url)))
      if (blobs.length > 0) console.log(`[AZETA-DL] Borrados ${blobs.length} blobs anteriores`)
    } catch {}

    // 4. Subir el CSV descomprimido como texto a Blob
    const csvBlob = new Blob([csvText], { type: "text/plain; charset=latin1" })
    const blob = await put("azeta-catalog/catalog.csv", csvBlob, { access: "public" })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const lineCount = csvText.split("\n").length - 1  // sin contar header
    console.log(`[AZETA-DL] CSV subido a Blob: ${blob.url} lineas=${lineCount} en ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      blob_url: blob.url,
      csv_size_mb: parseFloat((csvText.length / 1024 / 1024).toFixed(1)),
      total_lines: lineCount,
      elapsed_seconds: parseFloat(elapsed),
    })
  } catch (err: any) {
    console.error("[AZETA-DL] Error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Extrae el primer CSV/TXT de un ZIP
async function extractCSVFromZip(buf: Uint8Array): Promise<string> {
  let off = 0
  while (off < buf.length - 30) {
    if (buf[off]===0x50 && buf[off+1]===0x4b && buf[off+2]===0x03 && buf[off+3]===0x04) {
      const method = buf[off+8] | (buf[off+9] << 8)
      const compressedSize = (buf[off+18]|(buf[off+19]<<8)|(buf[off+20]<<16)|(buf[off+21]<<24))>>>0
      const fileNameLen = buf[off+26] | (buf[off+27] << 8)
      const extraLen   = buf[off+28] | (buf[off+29] << 8)
      const fileName   = new TextDecoder().decode(buf.subarray(off+30, off+30+fileNameLen))
      console.log(`[ZIP] entry="${fileName}" method=${method} compressed=${(compressedSize/1024/1024).toFixed(1)}MB`)

      if (/\.(csv|txt)$/i.test(fileName)) {
        const dataStart  = off + 30 + fileNameLen + extraLen
        const compressed = buf.subarray(dataStart, dataStart + compressedSize)
        if (method === 0) {
          return new TextDecoder("latin1").decode(compressed)
        } else if (method === 8) {
          const { inflateRawSync } = await import("zlib")
          const dec = inflateRawSync(Buffer.from(compressed))
          return new TextDecoder("latin1").decode(dec)
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
