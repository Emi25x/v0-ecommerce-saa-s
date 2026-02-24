import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { inflateRawSync, inflateSync } from "node:zlib"

export const maxDuration = 300

function normalizeEan(raw: string): string {
  if (!raw) return ""
  const cleaned = raw.replace(/[^0-9]/g, "")
  if (!cleaned) return ""
  return cleaned.padStart(13, "0")
}

async function extractCSVFromZip(zipBuffer: Buffer): Promise<string> {
  let offset = 0
  while (offset < zipBuffer.length - 30) {
    if (zipBuffer.readUInt32LE(offset) === 0x04034b50) {
      const compressionMethod = zipBuffer.readUInt16LE(offset + 8)
      const compressedSize = zipBuffer.readUInt32LE(offset + 18)
      const fileNameLength = zipBuffer.readUInt16LE(offset + 26)
      const extraFieldLength = zipBuffer.readUInt16LE(offset + 28)
      const fileName = zipBuffer.toString("utf-8", offset + 30, offset + 30 + fileNameLength)

      console.log(`[AZETA] ZIP entry: "${fileName}" method:${compressionMethod} size:${compressedSize}`)

      if (fileName.toLowerCase().match(/\.(csv|txt)$/)) {
        const dataStart = offset + 30 + fileNameLength + extraFieldLength
        const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize)

        let decompressed: Buffer
        if (compressionMethod === 0) {
          decompressed = compressedData
        } else if (compressionMethod === 8) {
          try { decompressed = inflateRawSync(compressedData) }
          catch { decompressed = inflateSync(compressedData) }
        } else {
          throw new Error(`Unsupported compression: ${compressionMethod}`)
        }

        // Convertir en chunks de 50MB para no exceder límite V8
        const CHUNK = 50 * 1024 * 1024
        const parts: string[] = []
        for (let i = 0; i < decompressed.length; i += CHUNK) {
          parts.push(decompressed.subarray(i, i + CHUNK).toString("latin1"))
        }
        return parts.join("")
      }
    }
    offset++
  }
  throw new Error("No CSV/TXT encontrado en el ZIP")
}

export async function POST(_request: NextRequest) {
  const startTime = Date.now()
  console.log("[AZETA] === Importación catálogo AZETA Total ===")

  try {
    const url = "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"

    // Descarga simple — la URL con credenciales funciona directo en cualquier browser
    console.log(`[AZETA] Descargando...`)
    const res = await fetch(url)

    console.log(`[AZETA] HTTP ${res.status}`)

    if (!res.ok) {
      return NextResponse.json({ error: `Error ${res.status} del servidor AZETA` }, { status: 502 })
    }

    const fileBuffer = Buffer.from(await res.arrayBuffer())
    console.log(`[AZETA] Descargado: ${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB en ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

    // Detectar ZIP
    const isZip = fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B
    let csvText: string
    if (isZip) {
      csvText = await extractCSVFromZip(fileBuffer)
    } else {
      const CHUNK = 50 * 1024 * 1024
      const parts: string[] = []
      for (let i = 0; i < fileBuffer.length; i += CHUNK) {
        parts.push(fileBuffer.subarray(i, i + CHUNK).toString("latin1"))
      }
      csvText = parts.join("")
    }
    console.log(`[AZETA] CSV listo: ${(csvText.length / 1024 / 1024).toFixed(1)}MB en ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

    // Parsear headers
    const firstNewline = csvText.indexOf("\n")
    const headerLine = csvText.substring(0, firstNewline).trim().replace(/['"]/g, "")
    const pipeCount = (headerLine.match(/\|/g) || []).length
    const semicolonCount = (headerLine.match(/;/g) || []).length
    const delimiter = pipeCount >= semicolonCount ? "|" : ";"
    const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase())
    console.log(`[AZETA] Delimiter: "${delimiter}", Headers: ${headers.slice(0, 10).join(", ")}`)

    // Índices de columnas
    const idx = {
      ean: headers.findIndex(h => h === "ean" || h === "isbn"),
      titulo: headers.findIndex(h => h === "titulo" || h === "title"),
      autor: headers.findIndex(h => h === "autor" || h === "author"),
      editorial: headers.findIndex(h => h === "editorial" || h === "publisher"),
      pvp: headers.findIndex(h => h === "pvp" || h === "precio"),
      idioma: headers.findIndex(h => h === "idioma" || h === "language"),
      sinopsis: headers.findIndex(h => h.includes("sinopsis") || h === "descripcion"),
      url: headers.findIndex(h => h === "url" || h === "imagen" || h === "portada"),
      ano: headers.findIndex(h => h.includes("ano_edicion") || h.includes("year")),
      codigo: headers.findIndex(h => h === "codigo_interno"),
    }

    if (idx.ean < 0) {
      return NextResponse.json({ error: `EAN no encontrado. Headers: ${headers.slice(0, 10).join(", ")}` }, { status: 500 })
    }

    // Construir lista de productos deduplicados por EAN
    const lines = csvText.split("\n")
    const productMap = new Map<string, any>()

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const cols = line.split(delimiter)
      if (cols.length <= idx.ean) continue

      const ean = normalizeEan(cols[idx.ean]?.replace(/['"]/g, "").trim())
      if (!ean || ean.length !== 13) continue

      const col = (i: number) => i >= 0 ? cols[i]?.replace(/['"]/g, "").trim() || null : null
      const priceStr = col(idx.pvp)
      const cost_price = priceStr ? parseFloat(priceStr.replace(",", ".")) || null : null

      productMap.set(ean, {
        sku: ean,
        ean,
        title: col(idx.titulo),
        author: col(idx.autor),
        brand: col(idx.editorial),
        cost_price,
        language: col(idx.idioma),
        description: col(idx.sinopsis),
        image_url: col(idx.url),
        year_edition: col(idx.ano),
        internal_code: col(idx.codigo),
      })
    }

    const allProducts = Array.from(productMap.values())
    console.log(`[AZETA] ${allProducts.length} productos únicos de ${lines.length - 1} líneas`)

    // Obtener EANs que ya existen para distinguir creados vs actualizados
    const supabase = createAdminClient()
    const allEans = allProducts.map(p => p.ean)
    const { data: existing } = await supabase.from("products").select("ean").in("ean", allEans.slice(0, 10000))
    const existingSet = new Set((existing || []).map((r: any) => r.ean))
    // Para el resto (> 10000) asumimos actualizados por defecto
    console.log(`[AZETA] ${existingSet.size} existentes (de los primeros 10,000 chequeados)`)

    // Upsert en batches de 500
    const BATCH_SIZE = 500
    let created = 0
    let updated = 0
    let errors = 0

    for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
      const batch = allProducts.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from("products").upsert(batch, { onConflict: "ean" })

      if (error) {
        console.error(`[AZETA] Upsert error batch ${i}: ${error.message}`)
        errors += batch.length
      } else {
        for (const p of batch) {
          existingSet.has(p.ean) ? updated++ : created++
        }
      }

      if (i % 10000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
        console.log(`[AZETA] ${i + batch.length}/${allProducts.length} - ${created} creados, ${updated} actualizados, ${elapsed}s`)
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA] === Completado: ${created} creados, ${updated} actualizados, ${errors} errores, ${elapsed}s ===`)

    return NextResponse.json({
      success: true,
      created,
      updated,
      errors,
      skipped: (lines.length - 1) - productMap.size,
      total_rows: productMap.size,
      elapsed_seconds: parseFloat(elapsed),
    })

  } catch (err: any) {
    console.error("[AZETA] Error fatal:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
