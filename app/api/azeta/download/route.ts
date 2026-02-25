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
    // 1. Fetch del ZIP desde AZETA — streaming directo a Blob sin bufferear en memoria
    console.log("[AZETA-DL] Iniciando stream ZIP → Blob...")
    const res = await fetch(url)
    console.log(`[AZETA-DL] status=${res.status} content-length=${res.headers.get("content-length")}`)
    if (!res.ok) {
      const preview = await res.text().then(t => t.slice(0, 200)).catch(() => "")
      return NextResponse.json({ error: `Error ${res.status} AZETA`, preview }, { status: 502 })
    }

    // 2. Borrar blobs anteriores del ZIP
    try {
      const { blobs } = await list({ prefix: "azeta-catalog/" })
      await Promise.all(blobs.map(b => del(b.url)))
    } catch {}

    // 3. Stream directo del body del fetch al put() de Blob — nunca carga nada en memoria
    const zipBlob = await put("azeta-catalog/catalog.zip", res.body!, {
      access: "public",
      contentType: "application/zip",
    })
    const elapsed1 = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA-DL] ZIP subido a Blob en ${elapsed1}s: ${zipBlob.url}`)

    // 4. Descargar el ZIP desde Blob, descomprimir, recontar lineas
    const zipRes = await fetch(zipBlob.url)
    const zipBuf = Buffer.from(await zipRes.arrayBuffer())
    console.log(`[AZETA-DL] ZIP descargado desde Blob: ${(zipBuf.length/1024/1024).toFixed(1)}MB`)

    const csvText = await extractCSVFromZip(new Uint8Array(zipBuf))
    const lines = csvText.split("\n")
    const totalLines = lines.filter(l => l.trim()).length - 1 // sin header

    // 5. Subir CSV descomprimido a Blob (para que process pueda usar Range)
    const csvBlobResult = await put("azeta-catalog/catalog.csv", csvText, {
      access: "public",
      contentType: "text/plain; charset=utf-8",
    })
    // Borrar ZIP ya que tenemos el CSV
    await del(zipBlob.url).catch(() => {})

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA-DL] CSV subido a Blob: ${csvBlobResult.url} lineas=${totalLines} en ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      blob_url: csvBlobResult.url,
      csv_size_mb: parseFloat((csvText.length / 1024 / 1024).toFixed(1)),
      total_lines: totalLines,
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
