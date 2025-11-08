"use server"

import { createClient } from "@/lib/supabase/server"

console.log("[v0] ========================================")
console.log("[v0] SERVER ACTION MODULE LOADED")
console.log("[v0] ========================================")

function detectSeparator(line: string): string {
  const commaCount = (line.match(/,/g) || []).length
  const semicolonCount = (line.match(/;/g) || []).length
  const pipeCount = (line.match(/\|/g) || []).length

  const max = Math.max(commaCount, semicolonCount, pipeCount)
  if (pipeCount === max) return "|"
  if (semicolonCount === max) return ";"
  return ","
}

function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === separator && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ""))
      current = ""
    } else {
      current += char
    }
  }

  result.push(current.trim().replace(/^["']|["']$/g, ""))
  return result
}

function parseNumericValue(value: string): number | null {
  if (!value || value === "" || value === "undefined" || value === "null") {
    return null
  }

  const cleaned = value.trim().replace(/,/g, ".")
  const parsed = Number.parseFloat(cleaned)
  if (isNaN(parsed)) {
    return null
  }

  return parsed
}

const STANDARD_FIELDS = [
  "sku",
  "title",
  "description",
  "price",
  "stock",
  "internal_code",
  "condition",
  "brand",
  "category",
  "image_url",
  "source",
]

const NUMERIC_FIELDS = ["price", "stock"]

export async function importFromCSV(sourceId: string, importMode: "update" | "overwrite" | "skip", preview = false) {
  console.log("[v0] ========================================")
  console.log("[v0] SERVER ACTION: importFromCSV CALLED")
  console.log("[v0] ========================================")
  console.log("[v0] Parameters:", { sourceId, importMode, preview })
  console.log("[v0] Timestamp:", new Date().toISOString())

  try {
    const supabase = await createClient()
    console.log("[v0] Supabase client created")

    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .single()

    if (sourceError || !source) {
      console.error("[v0] ERROR: Fuente no encontrada:", sourceError?.message)
      throw new Error("Fuente no encontrada")
    }

    console.log("[v0] Fuente encontrada:", source.name)
    console.log("[v0] Column mapping:", JSON.stringify(source.column_mapping, null, 2))

    const csvUrl = source.url_template
    if (!csvUrl) {
      console.error("[v0] ERROR: URL del CSV no configurada")
      throw new Error("URL del CSV no configurada")
    }

    console.log("[v0] Descargando CSV desde:", csvUrl)
    const response = await fetch(csvUrl)
    if (!response.ok) {
      console.error("[v0] ERROR: Error al descargar CSV:", response.statusText)
      throw new Error(`Error al descargar CSV: ${response.statusText}`)
    }

    const csvText = await response.text()
    console.log("[v0] CSV descargado, tamaño:", csvText.length, "bytes")

    const lines = csvText.split("\n").filter((line) => line.trim())
    console.log("[v0] Total de líneas:", lines.length)

    const separator = source.csv_separator || detectSeparator(lines[0])
    console.log(
      "[v0] Separador detectado:",
      separator === "|" ? "pipe (|)" : separator === ";" ? "semicolon (;)" : "comma (,)",
    )

    const headers = parseCSVLine(lines[0], separator)
    const dataLines = lines.slice(1)

    console.log("[v0] Headers del CSV:", headers)
    console.log("[v0] Total de registros a procesar:", dataLines.length)

    if (preview) {
      console.log("[v0] Modo preview, retornando total de registros")
      return { totalRecords: dataLines.length }
    }

    console.log("[v0] Creando registro de historial...")
    const { data: historyRecord, error: historyError } = await supabase
      .from("import_history")
      .insert({
        source_id: sourceId,
        status: "running",
        started_at: new Date().toISOString(),
        products_imported: 0,
        products_updated: 0,
        products_failed: 0,
      })
      .select()
      .single()

    if (historyError || !historyRecord) {
      console.error("[v0] ERROR: Error al crear registro de historial:", historyError?.message)
      throw new Error("Error al crear registro de historial")
    }

    console.log("[v0] Historial creado con ID:", historyRecord.id)

    let imported = 0
    let updated = 0
    let failed = 0

    console.log("[v0] Iniciando procesamiento de productos...")

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i]

      try {
        const values = parseCSVLine(line, separator)

        const standardFields: any = {}
        const customFields: any = {}

        Object.entries(source.column_mapping).forEach(([dbField, csvField]) => {
          const index = headers.indexOf(csvField as string)
          if (index !== -1 && values[index]) {
            const value = values[index].trim()
            if (value && value !== "" && value !== "undefined" && value !== "null") {
              if (NUMERIC_FIELDS.includes(dbField)) {
                const numericValue = parseNumericValue(value)
                if (numericValue !== null) {
                  if (STANDARD_FIELDS.includes(dbField)) {
                    standardFields[dbField] = numericValue
                  } else {
                    customFields[dbField] = numericValue
                  }
                }
              } else {
                if (STANDARD_FIELDS.includes(dbField)) {
                  standardFields[dbField] = value
                } else {
                  customFields[dbField] = value
                }
              }
            }
          }
        })

        if (
          !standardFields.sku ||
          standardFields.sku === "undefined" ||
          standardFields.sku === "" ||
          standardFields.sku === "null"
        ) {
          failed++
          continue
        }

        const { data: existing } = await supabase
          .from("products")
          .select("id, custom_fields")
          .eq("sku", standardFields.sku)
          .maybeSingle()

        const product: any = {
          ...standardFields,
        }

        if (Object.keys(customFields).length > 0) {
          if (existing?.custom_fields) {
            product.custom_fields = {
              ...existing.custom_fields,
              ...customFields,
            }
          } else {
            product.custom_fields = customFields
          }
        }

        if (existing) {
          if (importMode === "skip") {
            continue
          } else if (importMode === "update" || importMode === "overwrite") {
            const { error: updateError } = await supabase.from("products").update(product).eq("id", existing.id)
            if (updateError) {
              console.error("[v0] Error actualizando producto SKU:", standardFields.sku, "Error:", updateError.message)
              failed++
            } else {
              updated++
            }
          }
        } else {
          const { error: insertError } = await supabase.from("products").insert(product)
          if (insertError) {
            console.error("[v0] Error insertando producto SKU:", standardFields.sku, "Error:", insertError.message)
            failed++
          } else {
            imported++
          }
        }

        if ((i + 1) % 10 === 0) {
          console.log(
            `[v0] Progreso: ${i + 1}/${dataLines.length} - Importados: ${imported}, Actualizados: ${updated}, Fallidos: ${failed}`,
          )
        }
      } catch (error: any) {
        console.error("[v0] Error procesando línea", i + 1, ":", error.message)
        failed++
      }
    }

    console.log("[v0] Actualizando historial con resultados finales...")
    await supabase
      .from("import_history")
      .update({
        status: "success",
        completed_at: new Date().toISOString(),
        products_imported: imported,
        products_updated: updated,
        products_failed: failed,
      })
      .eq("id", historyRecord.id)

    console.log("[v0] ========================================")
    console.log("[v0] IMPORTACIÓN COMPLETADA EXITOSAMENTE")
    console.log("[v0] Total:", dataLines.length)
    console.log("[v0] Importados:", imported)
    console.log("[v0] Actualizados:", updated)
    console.log("[v0] Fallidos:", failed)
    console.log("[v0] ========================================")

    return {
      summary: {
        total: dataLines.length,
        imported,
        updated,
        failed,
      },
      historyId: historyRecord.id,
    }
  } catch (error: any) {
    console.error("[v0] ========================================")
    console.error("[v0] ERROR CRÍTICO EN IMPORTACIÓN")
    console.error("[v0] Error:", error.message)
    console.error("[v0] Stack:", error.stack)
    console.error("[v0] ========================================")
    throw new Error(error.message || "Error al importar")
  }
}
