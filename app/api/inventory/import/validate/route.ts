export const maxDuration = 60

import { type NextRequest, NextResponse } from "next/server"
import { requireCron } from "@/lib/auth/require-auth"
import { createClient } from "@/lib/db/server"

export async function POST(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response
  try {
    const { sourceId } = await request.json()

    if (!sourceId) {
      return NextResponse.json({ error: "Se requiere sourceId" }, { status: 400 })
    }

    const supabase = await createClient()

    // Obtener la fuente de importación
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 })
    }

    console.log("[v0] Validando fuente:", source.name)

    const validationResults = {
      valid: true,
      errors: [] as string[],
      warnings: [] as string[],
      info: [] as string[],
      checks: {
        sourceConfig: false,
        csvDownload: false,
        csvStructure: false,
        columnMapping: false,
        requiredFields: false,
        dataTypes: false,
        databaseSchema: false,
      },
    }

    // 1. Validar configuración de la fuente
    console.log("[v0] Validando configuración de la fuente...")
    if (!source.url_template) {
      validationResults.errors.push("La fuente no tiene URL configurada")
      validationResults.valid = false
    }
    if (!source.feed_type) {
      validationResults.errors.push("La fuente no tiene tipo de feed configurado")
      validationResults.valid = false
    }
    if (!source.column_mapping || Object.keys(source.column_mapping).length === 0) {
      validationResults.errors.push("La fuente no tiene mapeo de columnas configurado")
      validationResults.valid = false
    }
    validationResults.checks.sourceConfig = validationResults.errors.length === 0

    if (!validationResults.checks.sourceConfig) {
      return NextResponse.json(validationResults, { status: 200 })
    }

    // 2. Descargar y validar CSV
    console.log("[v0] Descargando muestra del CSV para validación...")
    let csvUrl = source.url_template
    if (source.credentials?.username && source.credentials?.password) {
      const separator = csvUrl.includes("?") ? "&" : "?"
      csvUrl = `${csvUrl}${separator}user=${source.credentials.username}&key=${source.credentials.password}`
    }

    let csvText: string
    try {
      const csvResponse = await fetch(csvUrl, {
        signal: AbortSignal.timeout(60000), // Aumentar timeout a 60 segundos
        headers: {
          Range: "bytes=0-524288", // Primeros 500KB
        },
      })

      if (!csvResponse.ok && csvResponse.status !== 206) {
        // 206 = Partial Content
        validationResults.errors.push(`Error al descargar CSV: ${csvResponse.status} ${csvResponse.statusText}`)
        validationResults.valid = false
        return NextResponse.json(validationResults, { status: 200 })
      }

      csvText = await csvResponse.text()
      validationResults.checks.csvDownload = true

      const contentLength = csvResponse.headers.get("content-length")
      const contentRange = csvResponse.headers.get("content-range")
      if (contentRange) {
        const totalSize = contentRange.split("/")[1]
        validationResults.info.push(
          `Muestra del CSV descargada (${(csvText.length / 1024).toFixed(2)} KB de ${(Number.parseInt(totalSize) / 1024).toFixed(2)} KB totales)`,
        )
      } else {
        validationResults.info.push(`CSV descargado exitosamente (${(csvText.length / 1024).toFixed(2)} KB)`)
      }
    } catch (error: any) {
      if (error.name === "TimeoutError" || error.message.includes("timeout") || error.message.includes("aborted")) {
        validationResults.errors.push(
          `Timeout al descargar CSV: El archivo es muy grande o la conexión es lenta. La validación requiere descargar una muestra del archivo.`,
        )
      } else {
        validationResults.errors.push(`Error al descargar CSV: ${error.message}`)
      }
      validationResults.valid = false
      return NextResponse.json(validationResults, { status: 200 })
    }

    // 3. Validar estructura del CSV
    console.log("[v0] Validando estructura del CSV...")
    const lines = csvText.trim().split("\n")
    if (lines.length < 2) {
      validationResults.errors.push("El CSV está vacío o solo tiene encabezados")
      validationResults.valid = false
      return NextResponse.json(validationResults, { status: 200 })
    }

    // Detectar delimitador
    const firstLine = lines[0]
    const delimiters = [",", ";", "\t", "|"]
    let delimiter = ","
    let maxCount = 0
    for (const d of delimiters) {
      const count = firstLine.split(d).length
      if (count > maxCount) {
        maxCount = count
        delimiter = d
      }
    }

    const headers = firstLine.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""))
    validationResults.checks.csvStructure = true
    validationResults.info.push(`CSV tiene ${headers.length} columnas y ${lines.length - 1} filas`)
    validationResults.info.push(`Delimitador detectado: "${delimiter === "\t" ? "\\t" : delimiter}"`)

    // 4. Validar mapeo de columnas
    console.log("[v0] Validando mapeo de columnas...")
    const mapping = source.column_mapping as Record<string, string>
    const mappedCsvColumns = Object.values(mapping)
    const missingColumns: string[] = []

    for (const csvColumn of mappedCsvColumns) {
      if (csvColumn !== "_skip" && !headers.includes(csvColumn)) {
        missingColumns.push(csvColumn)
      }
    }

    if (missingColumns.length > 0) {
      validationResults.errors.push(
        `Las siguientes columnas del mapeo no existen en el CSV: ${missingColumns.join(", ")}`,
      )
      validationResults.valid = false
    } else {
      validationResults.checks.columnMapping = true
      validationResults.info.push(`Todas las columnas mapeadas existen en el CSV`)
    }

    // 5. Validar campos obligatorios según tipo de feed
    console.log("[v0] Validando campos obligatorios...")
    const requiredFieldsByType: Record<string, string[]> = {
      catalog: ["internal_code", "sku", "title"],
      stock: ["sku", "stock"],
      stock_price: ["sku", "stock", "price"],
      price: ["sku", "price"],
    }

    const requiredFields = requiredFieldsByType[source.feed_type] || []
    const missingRequiredFields: string[] = []

    for (const field of requiredFields) {
      if (!mapping[field] || mapping[field] === "_skip") {
        missingRequiredFields.push(field)
      }
    }

    if (missingRequiredFields.length > 0) {
      validationResults.errors.push(
        `Faltan campos obligatorios para el tipo de feed "${source.feed_type}": ${missingRequiredFields.join(", ")}`,
      )
      validationResults.valid = false
    } else {
      validationResults.checks.requiredFields = true
      validationResults.info.push(`Todos los campos obligatorios están mapeados`)
    }

    // 6. Validar tipos de datos en una muestra
    console.log("[v0] Validando tipos de datos en muestra...")
    const sampleSize = Math.min(100, lines.length - 1)
    const sampleLines = lines.slice(1, sampleSize + 1)
    const dataTypeErrors: string[] = []

    for (let i = 0; i < sampleLines.length; i++) {
      const values = sampleLines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""))

      // Validar price (debe ser numérico)
      if (mapping.price && mapping.price !== "_skip") {
        const priceIndex = headers.indexOf(mapping.price)
        if (priceIndex !== -1 && values[priceIndex]) {
          const priceValue = values[priceIndex].replace(/[^\d.,]/g, "")
          if (priceValue && isNaN(Number.parseFloat(priceValue))) {
            dataTypeErrors.push(`Fila ${i + 2}: El precio "${values[priceIndex]}" no es un número válido`)
            if (dataTypeErrors.length >= 5) break // Limitar a 5 errores
          }
        }
      }

      // Validar stock (debe ser entero)
      if (mapping.stock && mapping.stock !== "_skip") {
        const stockIndex = headers.indexOf(mapping.stock)
        if (stockIndex !== -1 && values[stockIndex]) {
          const stockValue = values[stockIndex].replace(/[^\d]/g, "")
          if (stockValue && isNaN(Number.parseInt(stockValue))) {
            dataTypeErrors.push(`Fila ${i + 2}: El stock "${values[stockIndex]}" no es un número entero válido`)
            if (dataTypeErrors.length >= 5) break
          }
        }
      }
    }

    if (dataTypeErrors.length > 0) {
      validationResults.warnings.push(...dataTypeErrors)
      if (dataTypeErrors.length >= 5) {
        validationResults.warnings.push("... y posiblemente más errores de tipo de datos")
      }
    } else {
      validationResults.checks.dataTypes = true
      validationResults.info.push(`Tipos de datos validados en ${sampleSize} filas de muestra`)
    }

    // 7. Validar schema de la base de datos
    console.log("[v0] Validando schema de la base de datos...")
    const schemaChecks = {
      customFieldsColumn: false,
      skuUniqueConstraint: false,
    }

    // Verificar que existe el campo custom_fields
    const { error: customFieldsError } = await supabase.from("products").select("custom_fields").limit(1)

    if (customFieldsError && customFieldsError.message.includes("custom_fields")) {
      validationResults.errors.push(
        "La tabla 'products' no tiene el campo 'custom_fields'. Ejecuta el script 008_add_custom_fields_to_products.sql",
      )
      validationResults.valid = false
    } else {
      schemaChecks.customFieldsColumn = true
    }

    // Verificar constraint UNIQUE en SKU intentando insertar un duplicado
    const testSku = `TEST-VALIDATION-${Date.now()}`
    const { error: insertError1 } = await supabase.from("products").insert({
      sku: testSku,
      title: "Test Product",
      internal_code: `TEST-${Date.now()}`,
    })

    if (!insertError1) {
      // Intentar insertar el mismo SKU de nuevo
      const { error: insertError2 } = await supabase.from("products").insert({
        sku: testSku,
        title: "Test Product 2",
        internal_code: `TEST-${Date.now()}-2`,
      })

      if (insertError2 && insertError2.message.includes("duplicate key")) {
        schemaChecks.skuUniqueConstraint = true
        // Limpiar el producto de prueba
        await supabase.from("products").delete().eq("sku", testSku)
      } else {
        validationResults.errors.push(
          "La tabla 'products' no tiene constraint UNIQUE en el campo 'sku'. Ejecuta el script 007_add_sku_unique_constraint.sql",
        )
        validationResults.valid = false
        // Limpiar productos de prueba
        await supabase.from("products").delete().eq("sku", testSku)
      }
    } else {
      validationResults.errors.push(`Error al verificar schema: ${insertError1.message}`)
      validationResults.valid = false
    }

    validationResults.checks.databaseSchema = schemaChecks.customFieldsColumn && schemaChecks.skuUniqueConstraint

    if (validationResults.checks.databaseSchema) {
      validationResults.info.push("Schema de la base de datos validado correctamente")
    }

    // Resumen final
    console.log("[v0] Validación completada")
    console.log("[v0] Errores:", validationResults.errors.length)
    console.log("[v0] Advertencias:", validationResults.warnings.length)

    return NextResponse.json(validationResults, { status: 200 })
  } catch (error: any) {
    console.error("[v0] Error en validación:", error)
    return NextResponse.json(
      {
        error: "Error al validar la importación",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
