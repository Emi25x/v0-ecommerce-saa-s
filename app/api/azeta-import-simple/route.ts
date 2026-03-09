/**
 * @deprecated /api/azeta-import-simple
 *
 * Ruta de importación simplificada con URL hardcodeada y sin configuración de fuente.
 * NO usar — existe solo como respaldo de emergencia.
 *
 * Rutas oficiales de reemplazo:
 *   - Cron catálogo completo → POST /api/azeta/import-catalog
 *   - Importación manual UI  → POST /api/azeta/download + POST /api/azeta/process
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { inflateRawSync } from "node:zlib"

export const maxDuration = 300

export async function POST(request: NextRequest) {
  console.warn(
    "[DEPRECATED] POST /api/azeta-import-simple — " +
    "usar POST /api/azeta/import-catalog (cron) o POST /api/azeta/download + /api/azeta/process (UI)"
  )
  console.log("[AZETA-SIMPLE] ==================== STARTING ====================")
  const startTime = Date.now()
  
  try {
    const supabase = createAdminClient()
    
    // 1. Descargar ZIP
    const url = "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"
    console.log("[AZETA-SIMPLE] Downloading ZIP from AZETA...")
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const zipBuffer = Buffer.from(await response.arrayBuffer())
    console.log(`[AZETA-SIMPLE] Downloaded ${zipBuffer.length} bytes`)
    
    // 2. Extraer CSV del ZIP
    console.log("[AZETA-SIMPLE] Extracting CSV from ZIP...")
    const csvBuffer = extractCSVFromZIP(zipBuffer)
    const csvText = csvBuffer.toString('utf-8')
    console.log(`[AZETA-SIMPLE] Extracted CSV: ${csvText.length} characters`)
    
    // 3. Parsear CSV con delimiter PIPE
    console.log("[AZETA-SIMPLE] Parsing CSV with pipe delimiter...")
    const lines = csvText.split('\n').filter(line => line.trim())
    const headers = lines[0].split('|')
    console.log(`[AZETA-SIMPLE] Headers:`, headers.slice(0, 5))
    
    let created = 0
    let updated = 0
    let errors = 0
    
    // 4. Procesar en batches de 100
    for (let i = 1; i < lines.length; i += 100) {
      const batch = lines.slice(i, i + 100)
      
      for (const line of batch) {
        try {
          const values = line.split('|')
          const ean = normalizeEAN(values[0])
          
          if (!ean) continue
          
          const product = {
            ean,
            titulo: values[1] || null,
            autor: values[2] || null,
            editorial: values[3] || null,
            precio: parseFloat(values[4]) || null,
            stock: parseInt(values[5]) || 0,
            updated_at: new Date().toISOString()
          }
          
          const { error } = await supabase
            .from('products')
            .upsert(product, { onConflict: 'ean' })
          
          if (error) {
            errors++
            console.error(`[AZETA-SIMPLE] Error on EAN ${ean}:`, error.message)
          } else {
            if (i === 1) created++
            else updated++
          }
        } catch (err: any) {
          errors++
          console.error(`[AZETA-SIMPLE] Parse error:`, err.message)
        }
      }
      
      if (i % 1000 === 0) {
        console.log(`[AZETA-SIMPLE] Processed ${i}/${lines.length} lines...`)
      }
    }
    
    const elapsed = Date.now() - startTime
    console.log(`[AZETA-SIMPLE] ==================== COMPLETED ====================`)
    console.log(`[AZETA-SIMPLE] Time: ${elapsed}ms | Created: ${created} | Updated: ${updated} | Errors: ${errors}`)
    
    return NextResponse.json({
      success: true,
      created,
      updated,
      errors,
      total: lines.length - 1,
      elapsed_ms: elapsed
    })
    
  } catch (error: any) {
    console.error("[AZETA-SIMPLE] FATAL ERROR:", error)
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 })
  }
}

function extractCSVFromZIP(zipBuffer: Buffer): Buffer {
  // Buscar local file header: 0x04034b50
  let offset = 0
  
  while (offset < zipBuffer.length - 30) {
    if (zipBuffer.readUInt32LE(offset) === 0x04034b50) {
      const compressionMethod = zipBuffer.readUInt16LE(offset + 8)
      const compressedSize = zipBuffer.readUInt32LE(offset + 18)
      const fileNameLength = zipBuffer.readUInt16LE(offset + 26)
      const extraFieldLength = zipBuffer.readUInt16LE(offset + 28)
      
      const fileName = zipBuffer.toString('utf-8', offset + 30, offset + 30 + fileNameLength)
      
      if (fileName.toLowerCase().endsWith('.csv')) {
        console.log(`[AZETA-SIMPLE] Found CSV in ZIP: ${fileName}`)
        
        const dataStart = offset + 30 + fileNameLength + extraFieldLength
        const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize)
        
        if (compressionMethod === 0) {
          return compressedData
        } else if (compressionMethod === 8) {
          return inflateRawSync(compressedData)
        }
      }
    }
    offset++
  }
  
  throw new Error("No CSV found in ZIP")
}

function normalizeEAN(ean: string): string | null {
  if (!ean) return null
  const cleaned = ean.replace(/[^0-9]/g, '')
  if (cleaned.length < 10 || cleaned.length > 13) return null
  return cleaned.padStart(13, '0')
}
