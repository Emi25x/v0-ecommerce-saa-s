import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { inflateRawSync, inflateSync, unzipSync } from "node:zlib"

export const maxDuration = 300 // 5 minutos

function normalizeEan(raw: string): string {
  if (!raw) return ""
  const cleaned = raw.replace(/[^0-9]/g, "")
  if (cleaned.length === 0) return ""
  // Pad to 13 digits
  return cleaned.padStart(13, "0")
}

async function extractCSVFromZip(zipBuffer: Buffer): Promise<string> {
  // Search for local file header: PK\x03\x04
  let offset = 0
  
  while (offset < zipBuffer.length - 30) {
    if (zipBuffer.readUInt32LE(offset) === 0x04034b50) {
      const compressionMethod = zipBuffer.readUInt16LE(offset + 8)
      const compressedSize = zipBuffer.readUInt32LE(offset + 18)
      const uncompressedSize = zipBuffer.readUInt32LE(offset + 22)
      const fileNameLength = zipBuffer.readUInt16LE(offset + 26)
      const extraFieldLength = zipBuffer.readUInt16LE(offset + 28)
      const fileName = zipBuffer.toString("utf-8", offset + 30, offset + 30 + fileNameLength)
      
      console.log(`[AZETA] Found ZIP entry: ${fileName}, method: ${compressionMethod}, compressed: ${compressedSize}, uncompressed: ${uncompressedSize}`)
      
      if (fileName.toLowerCase().endsWith(".csv") || fileName.toLowerCase().endsWith(".txt")) {
        const dataStart = offset + 30 + fileNameLength + extraFieldLength
        const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize)
        
        let decompressed: Buffer
        if (compressionMethod === 0) {
          // Stored (no compression)
          decompressed = compressedData
        } else if (compressionMethod === 8) {
          // DEFLATE - try inflateRawSync first, fallback to inflateSync
          try {
            decompressed = inflateRawSync(compressedData)
          } catch (e) {
            console.log("[AZETA] inflateRawSync failed, trying inflateSync...")
            decompressed = inflateSync(compressedData)
          }
        } else {
          throw new Error(`Unsupported compression method: ${compressionMethod}`)
        }
        
        console.log(`[AZETA] Decompressed size: ${decompressed.length} bytes`)
        
        // Convert to string in 50MB chunks to avoid V8 string limit
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
  
  throw new Error("No CSV/TXT file found inside ZIP")
}

export async function POST(_request: NextRequest) {
  console.log("[AZETA] === Iniciando importación catálogo AZETA Total ===")
  const startTime = Date.now()
  
  try {
    const url = "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"
    
    console.log("[AZETA] Descargando archivo...")
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; catalog-importer/1.0)",
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate",
      },
    })
    
    console.log(`[AZETA] HTTP ${response.status} ${response.statusText}`)
    console.log(`[AZETA] Content-Type: ${response.headers.get("content-type")}`)
    console.log(`[AZETA] Content-Length: ${response.headers.get("content-length")}`)
    
    if (!response.ok) {
      return NextResponse.json({ error: `HTTP ${response.status}: ${response.statusText}` }, { status: 500 })
    }
    
    const fileBuffer = Buffer.from(await response.arrayBuffer())
    console.log(`[AZETA] Archivo descargado: ${fileBuffer.length} bytes en ${(Date.now() - startTime) / 1000}s`)
    
    // Detect if ZIP
    const isZip = fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B
    console.log(`[AZETA] Es ZIP: ${isZip}`)
    
    let csvText: string
    if (isZip) {
      csvText = await extractCSVFromZip(fileBuffer)
    } else {
      // Direct CSV - convert in chunks
      const CHUNK = 50 * 1024 * 1024
      const parts: string[] = []
      for (let i = 0; i < fileBuffer.length; i += CHUNK) {
        parts.push(fileBuffer.subarray(i, i + CHUNK).toString("latin1"))
      }
      csvText = parts.join("")
    }
    
    console.log(`[AZETA] CSV listo: ${csvText.length} chars en ${(Date.now() - startTime) / 1000}s`)
    
    // Parse CSV - split by lines, detect delimiter
    const firstNewline = csvText.indexOf("\n")
    const headerLine = csvText.substring(0, firstNewline).trim()
    
    // Detect delimiter from header
    const pipeCount = (headerLine.match(/\|/g) || []).length
    const semicolonCount = (headerLine.match(/;/g) || []).length
    const delimiter = pipeCount >= semicolonCount ? "|" : ";"
    console.log(`[AZETA] Delimiter: "${delimiter}" (pipes: ${pipeCount}, semicolons: ${semicolonCount})`)
    
    const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, ""))
    console.log(`[AZETA] Headers: ${headers.slice(0, 10).join(", ")}`)
    
    // Find column indices
    const eanIdx = headers.findIndex(h => h === "ean" || h === "isbn" || h === "codigo_ean")
    const tituloIdx = headers.findIndex(h => h === "titulo" || h === "title")
    const autorIdx = headers.findIndex(h => h === "autor" || h === "author")
    const editorialIdx = headers.findIndex(h => h === "editorial" || h === "publisher")
    const pvpIdx = headers.findIndex(h => h === "pvp" || h === "precio" || h === "price")
    
    if (eanIdx < 0) {
      return NextResponse.json({ error: `Columna EAN no encontrada. Headers: ${headers.slice(0, 10).join(", ")}` }, { status: 500 })
    }
    
    console.log(`[AZETA] EAN col: ${eanIdx}, titulo: ${tituloIdx}, autor: ${autorIdx}`)
    
    // Process lines
    const supabase = createAdminClient()
    let created = 0
    let updated = 0
    let skipped = 0
    let batch: any[] = []
    const BATCH_SIZE = 100
    
    // Split into lines
    const lines = csvText.split("\n")
    const totalLines = lines.length - 1 // minus header
    console.log(`[AZETA] Total líneas: ${totalLines}`)
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      const cols = line.split(delimiter)
      if (cols.length <= eanIdx) { skipped++; continue }
      
      const rawEan = cols[eanIdx]?.replace(/['"]/g, "").trim()
      const ean = normalizeEan(rawEan)
      
      // EAN must be exactly 13 digits
      if (!ean || ean.length !== 13) { skipped++; continue }
      
      batch.push({
        sku: ean,
        ean,
        title: tituloIdx >= 0 ? cols[tituloIdx]?.replace(/['"]/g, "").trim() || null : null,
        author: autorIdx >= 0 ? cols[autorIdx]?.replace(/['"]/g, "").trim() || null : null,
        brand: editorialIdx >= 0 ? cols[editorialIdx]?.replace(/['"]/g, "").trim() || null : null,
        cost_price: pvpIdx >= 0 ? parseFloat(cols[pvpIdx]?.replace(",", ".") || "0") || null : null,
      })
      
      if (batch.length >= BATCH_SIZE) {
        const { error } = await supabase.from("products").upsert(batch, { onConflict: "ean" })
        if (error) {
          console.error(`[AZETA] Upsert error at line ${i}:`, error.message)
        } else {
          updated += batch.length
        }
        batch = []
      }
      
      if (i % 10000 === 0) {
        console.log(`[AZETA] Progreso: ${i}/${lines.length} líneas, ${updated} procesados, ${(Date.now() - startTime) / 1000}s`)
      }
    }
    
    // Final batch
    if (batch.length > 0) {
      const { error } = await supabase.from("products").upsert(batch, { onConflict: "ean" })
      if (!error) updated += batch.length
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA] === Completado en ${elapsed}s: ${updated} productos, ${skipped} saltados ===`)
    
    return NextResponse.json({
      success: true,
      created,
      updated,
      skipped,
      total_rows: totalLines,
      elapsed_seconds: parseFloat(elapsed),
    })
    
  } catch (error: any) {
    console.error("[AZETA] Error fatal:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
