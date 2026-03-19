import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { fetchWithAuth } from "@/lib/http/fetch-with-auth"
import { inflateRawSync } from "node:zlib"
import crypto from "crypto"

export const maxDuration = 300 // 5 minutos para descargas grandes

/**
 * POST /api/inventory/import/run/start
 * Inicia una importación PRO (ULTRA-RÁPIDO):
 * 1. Descarga CSV streaming
 * 2. Upload directo a Storage
 * 3. Crea run record
 * 4. Retorna inmediatamente (sanity check se hace en primer step)
 */
export async function POST(request: NextRequest) {
  console.log("[v0][RUN/START] ========== VERSION 2024-ZIP-FIX ==========")
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const body = await request.json()
    const { source_id, mode = "upsert" } = body

    if (!source_id) {
      return NextResponse.json({ error: "source_id es requerido" }, { status: 400 })
    }

    console.log(`[v0][RUN/START] Iniciando importación PRO para source_id=${source_id}`)

    // 1. Obtener configuración de la fuente
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", source_id)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 })
    }

    // 2. Descargar CSV
    console.log(`[v0][RUN/START] Descargando CSV desde ${source.url_template}`)

    const fileResponse = await fetchWithAuth({
      url_template: source.url_template,
      auth_type: source.auth_type,
      credentials: source.credentials,
    })

    if (!fileResponse.ok) {
      return NextResponse.json(
        {
          error: `Error descargando CSV: ${fileResponse.status}`,
        },
        { status: 500 },
      )
    }

    // Descargar como buffer para detectar si es ZIP
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer())
    console.log(`[v0][RUN/START] Archivo descargado: ${fileBuffer.length} bytes`)

    // Detectar si es ZIP (magic bytes: PK = 0x50 0x4B)
    const isZip = fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b
    console.log(`[v0][RUN/START] Es ZIP: ${isZip}`)

    let csvText: string = ""

    if (isZip) {
      console.log(`[v0][RUN/START] Extrayendo CSV del ZIP...`)
      try {
        // Buscar local file header: 0x04034b50
        let offset = 0
        let found = false

        while (offset < fileBuffer.length - 30 && !found) {
          if (fileBuffer.readUInt32LE(offset) === 0x04034b50) {
            // Leer header fields
            const compressionMethod = fileBuffer.readUInt16LE(offset + 8)
            const compressedSize = fileBuffer.readUInt32LE(offset + 18)
            const fileNameLength = fileBuffer.readUInt16LE(offset + 26)
            const extraFieldLength = fileBuffer.readUInt16LE(offset + 28)

            // Leer nombre del archivo
            const fileName = fileBuffer.toString("utf-8", offset + 30, offset + 30 + fileNameLength)
            console.log(`[v0][RUN/START] Archivo encontrado en ZIP: ${fileName}`)

            // Verificar que sea CSV
            if (fileName.toLowerCase().endsWith(".csv")) {
              const dataStart = offset + 30 + fileNameLength + extraFieldLength
              const compressedData = fileBuffer.subarray(dataStart, dataStart + compressedSize)

              if (compressionMethod === 0) {
                // Sin compresión
                csvText = compressedData.toString("utf-8")
                console.log(`[v0][RUN/START] CSV extraído (sin compresión): ${csvText.length} chars`)
              } else if (compressionMethod === 8) {
                // DEFLATE
                const decompressed = inflateRawSync(compressedData)
                csvText = decompressed.toString("utf-8")
                console.log(`[v0][RUN/START] CSV extraído (DEFLATE): ${csvText.length} chars`)
              } else {
                throw new Error(`Método de compresión no soportado: ${compressionMethod}`)
              }
              found = true
            }
          }
          offset++
        }

        if (!found) {
          throw new Error("No se encontró archivo CSV en el ZIP")
        }
      } catch (error: any) {
        console.error(`[v0][RUN/START] Error extrayendo ZIP:`, error)
        return NextResponse.json(
          {
            error: `Error extrayendo ZIP: ${error.message}`,
          },
          { status: 500 },
        )
      }
    } else {
      // Archivo CSV directo
      csvText = fileBuffer.toString("utf-8")
      console.log(`[v0][RUN/START] CSV directo: ${csvText.length} chars`)
    }

    const elapsed = Date.now() - startTime
    console.log(`[v0][RUN/START] Procesamiento completado en ${elapsed}ms`)

    // 3. Upload a Storage (sin procesar el CSV aún)
    const runId = crypto.randomUUID()
    const storagePath = `imports/${source_id}/${runId}.csv`

    const uploadStart = Date.now()
    const { error: uploadError } = await supabase.storage.from("imports").upload(storagePath, csvText, {
      contentType: "text/csv",
      upsert: false,
    })

    if (uploadError) {
      console.error(`[v0][RUN/START] Error subiendo a Storage:`, uploadError)
      return NextResponse.json(
        {
          error: `Error guardando CSV: ${uploadError.message}`,
        },
        { status: 500 },
      )
    }

    const uploadElapsed = Date.now() - uploadStart
    console.log(`[v0][RUN/START] CSV subido a Storage en ${uploadElapsed}ms: ${storagePath}`)

    // 4. Crear import_run (sin calcular total_rows aún, se hace en primer step)
    const { data: run, error: runError } = await supabase
      .from("import_runs")
      .insert({
        id: runId,
        source_id,
        mode,
        status: "pending", // pending hasta que step calcule total_rows
        storage_path: storagePath,
        total_rows: 0, // Se calcula en primer step
        processed_rows: 0,
        created_count: 0,
        updated_count: 0,
        failed_count: 0,
      })
      .select()
      .single()

    if (runError) {
      console.error(`[v0][RUN/START] Error creando run:`, runError)
      return NextResponse.json(
        {
          error: `Error creando run: ${runError.message}`,
        },
        { status: 500 },
      )
    }

    const totalElapsed = Date.now() - startTime
    console.log(`[v0][RUN/START] Run creado exitosamente en ${totalElapsed}ms: ${runId}`)

    return NextResponse.json({
      ok: true,
      run_id: runId,
      storage_path: storagePath,
    })
  } catch (error: any) {
    console.error("[v0][RUN/START] Error inesperado:", error)
    return NextResponse.json(
      {
        error: error.message || "Error interno del servidor",
      },
      { status: 500 },
    )
  }
}
