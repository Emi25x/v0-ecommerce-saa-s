import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

console.log("[v0] ==================== CSV MODULE LOADED ====================")

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

export async function POST(request: NextRequest) {
  console.log("[v0] ==================== CSV POST CALLED ====================")
  console.log("[v0] Timestamp:", new Date().toISOString())
  console.log("[v0] Request URL:", request.url)
  console.log("[v0] Request method:", request.method)

  try {
    const supabase = await createClient()
    const body = await request.json()
    const { sourceId, importMode = "update", preview = false } = body

    console.log("[v0] CSV Import - Source:", sourceId, "Mode:", importMode, "Preview:", preview)

    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .single()

    if (sourceError || !source) {
      console.error("[v0] Source not found:", sourceError)
      return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 })
    }

    console.log("[v0] Fuente encontrada:", source.name)
    console.log("[v0] Column mapping:", JSON.stringify(source.column_mapping))

    const csvUrl = source.url_template
    if (!csvUrl) {
      return NextResponse.json({ error: "URL del CSV no configurada" }, { status: 400 })
    }

    console.log("[v0] Descargando CSV desde:", csvUrl)
    const response = await fetch(csvUrl)
    if (!response.ok) {
      return NextResponse.json({ error: `Error al descargar CSV: ${response.statusText}` }, { status: 500 })
    }

    const csvText = await response.text()
    const lines = csvText.split("\n").filter((line) => line.trim())

    const separator = source.csv_separator || detectSeparator(lines[0])
    console.log(
      "[v0] Separador usado:",
      separator === ";" ? "punto y coma" : separator === "|" ? "pipe" : separator === "\t" ? "tab" : "coma",
    )

    const headers = parseCSVLine(lines[0], separator)
    const dataLines = lines.slice(1)

    console.log("[v0] CSV headers:", headers)
    console.log("[v0] CSV descargado:", dataLines.length, "registros")

    if (preview) {
      return NextResponse.json({ totalRecords: dataLines.length })
    }

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
      console.error("[v0] Error creating history:", historyError)
      return NextResponse.json({ error: "Error al crear registro de historial" }, { status: 500 })
    }

    console.log("[v0] Historial creado:", historyRecord.id)

    const skusInCSV = new Set<string>()

    let imported = 0
    let updated = 0
    let failed = 0

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
                } else {
                  console.log(`[v0] Valor numérico inválido para ${dbField}: "${value}", saltando campo`)
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
          console.log("[v0] SKU inválido en línea", i + 2, ", saltando producto")
          failed++
          continue
        }

        skusInCSV.add(standardFields.sku)

        console.log("[v0] Procesando producto", i + 1, "de", dataLines.length, "- SKU:", standardFields.sku)

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
              console.error("[v0] Error actualizando producto:", updateError.message)
              failed++
            } else {
              updated++
            }
          }
        } else {
          const { error: insertError } = await supabase.from("products").insert(product)
          if (insertError) {
            console.error("[v0] Error insertando producto:", insertError.message)
            failed++
          } else {
            imported++
          }
        }

        if ((i + 1) % 100 === 0) {
          await supabase
            .from("import_history")
            .update({
              products_imported: imported,
              products_updated: updated,
              products_failed: failed,
            })
            .eq("id", historyRecord.id)

          console.log(
            "[v0] Progreso:",
            i + 1,
            "de",
            dataLines.length,
            "- Importados:",
            imported,
            "Actualizados:",
            updated,
            "Fallidos:",
            failed,
          )
        }
      } catch (error: any) {
        console.error("[v0] Error procesando línea", i + 2, ":", error.message)
        failed++
      }
    }

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

    console.log("[v0] Importación completada:", { imported, updated, failed })

    return NextResponse.json({
      summary: {
        total: dataLines.length,
        imported,
        updated,
        failed,
      },
      historyId: historyRecord.id,
    })
  } catch (error: any) {
    console.error("[v0] FATAL ERROR in CSV import:", error.message, error.stack)
    return NextResponse.json({ error: error.message || "Error al importar" }, { status: 500 })
  }
}
