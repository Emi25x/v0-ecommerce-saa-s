import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { inflateRawSync } from "node:zlib"

export const maxDuration = 300 // 5 minutos

function normalizeEan(ean: string): string {
  if (!ean) return ""
  return ean.replace(/[^0-9]/g, "").padStart(13, "0")
}

async function extractCSVFromZip(zipBuffer: Buffer): Promise<string> {
  let offset = 0
  
  while (offset < zipBuffer.length - 30) {
    if (zipBuffer.readUInt32LE(offset) === 0x04034b50) {
      const compressionMethod = zipBuffer.readUInt16LE(offset + 8)
      const compressedSize = zipBuffer.readUInt32LE(offset + 18)
      const fileNameLength = zipBuffer.readUInt16LE(offset + 26)
      const extraFieldLength = zipBuffer.readUInt16LE(offset + 28)
      
      const fileName = zipBuffer.toString('utf-8', offset + 30, offset + 30 + fileNameLength)
      
      if (fileName.toLowerCase().endsWith('.csv')) {
        const dataStart = offset + 30 + fileNameLength + extraFieldLength
        const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize)
        
        if (compressionMethod === 0) {
          // Convert in chunks to avoid string length limit
          const chunks: string[] = []
          const chunkSize = 50 * 1024 * 1024 // 50MB chunks
          for (let i = 0; i < compressedData.length; i += chunkSize) {
            chunks.push(compressedData.subarray(i, i + chunkSize).toString('utf-8'))
          }
          return chunks.join('')
        } else if (compressionMethod === 8) {
          const decompressed = inflateRawSync(compressedData)
          // Convert in chunks
          const chunks: string[] = []
          const chunkSize = 50 * 1024 * 1024 // 50MB chunks
          for (let i = 0; i < decompressed.length; i += chunkSize) {
            chunks.push(decompressed.subarray(i, i + chunkSize).toString('utf-8'))
          }
          return chunks.join('')
        }
      }
    }
    offset++
  }
  
  throw new Error("No CSV file found in ZIP")
}

export async function POST(request: NextRequest) {
  console.log("[AZETA-DIRECT] Iniciando importación AZETA catálogo directo...")
  
  try {
    // 1. Descargar ZIP
    const url = "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const zipBuffer = Buffer.from(await response.arrayBuffer())
    console.log(`[AZETA-DIRECT] ZIP descargado: ${zipBuffer.length} bytes`)
    
    // 2. Extraer CSV
    const csvText = await extractCSVFromZip(zipBuffer)
    console.log(`[AZETA-DIRECT] CSV extraído: ${csvText.length} chars`)
    
    // 3. Parsear con delimiter PIPE
    const lines = csvText.split('\n').filter(l => l.trim())
    const headers = lines[0].split('|').map(h => h.trim())
    
    console.log(`[AZETA-DIRECT] Headers: ${headers.slice(0, 5).join(", ")}`)
    console.log(`[AZETA-DIRECT] Total líneas: ${lines.length}`)
    
    // 4. Encontrar índices de columnas
    const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean')
    const tituloIdx = headers.findIndex(h => h.toLowerCase() === 'titulo')
    const autorIdx = headers.findIndex(h => h.toLowerCase() === 'autor')
    const editorialIdx = headers.findIndex(h => h.toLowerCase() === 'editorial')
    const precioIdx = headers.findIndex(h => h.toLowerCase() === 'pvp')
    
    if (eanIdx < 0) {
      throw new Error(`No se encontró columna EAN. Headers: ${headers.join(", ")}`)
    }
    
    console.log(`[AZETA-DIRECT] EAN en columna ${eanIdx}`)
    
    // 5. Procesar productos
    const supabase = createAdminClient()
    let created = 0
    let updated = 0
    let skipped = 0
    
    const batch = []
    
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split('|')
      
      if (row.length <= eanIdx) {
        skipped++
        continue
      }
      
      const ean = normalizeEan(row[eanIdx])
      
      if (!ean || ean.length < 10) {
        skipped++
        continue
      }
      
      batch.push({
        sku: `AZETA-${ean}`,
        ean,
        title: tituloIdx >= 0 ? row[tituloIdx]?.trim() : null,
        author: autorIdx >= 0 ? row[autorIdx]?.trim() : null,
        publisher: editorialIdx >= 0 ? row[editorialIdx]?.trim() : null,
        cost_price: precioIdx >= 0 ? parseFloat(row[precioIdx]) || null : null,
      })
      
      // Procesar cada 100
      if (batch.length >= 100) {
        const { error } = await supabase.from("products").upsert(batch, {
          onConflict: "ean",
          ignoreDuplicates: false,
        })
        
        if (error) {
          console.error("[AZETA-DIRECT] Error upsert:", error)
        } else {
          updated += batch.length
        }
        
        batch.length = 0
      }
      
      if (i % 5000 === 0) {
        console.log(`[AZETA-DIRECT] Procesados: ${i}/${lines.length}`)
      }
    }
    
    // Batch final
    if (batch.length > 0) {
      const { error } = await supabase.from("products").upsert(batch, {
        onConflict: "ean",
        ignoreDuplicates: false,
      })
      
      if (!error) {
        updated += batch.length
      }
    }
    
    console.log(`[AZETA-DIRECT] Completado: ${updated} productos, ${skipped} saltados`)
    
    return NextResponse.json({
      success: true,
      updated,
      skipped,
      total: lines.length - 1
    })
    
  } catch (error: any) {
    console.error("[AZETA-DIRECT] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
