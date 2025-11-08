import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function checkArnoiaCSV() {
  console.log("[v0] Consultando configuración de la fuente Arnoia Act...")

  // Obtener la configuración de la fuente
  const { data: sources, error: sourceError } = await supabase
    .from("import_sources")
    .select("*")
    .ilike("name", "%arnoia%act%")
    .single()

  if (sourceError) {
    console.error("[v0] Error al consultar la fuente:", sourceError)
    return
  }

  if (!sources) {
    console.log('[v0] No se encontró la fuente "Arnoia Act"')
    return
  }

  console.log("[v0] Fuente encontrada:", sources.name)
  console.log("[v0] URL:", sources.url_template)
  console.log("[v0] Column Mapping:", JSON.stringify(sources.column_mapping, null, 2))

  // Descargar el CSV
  console.log("\n[v0] Descargando CSV...")
  const response = await fetch(sources.url_template)
  const csvText = await response.text()

  // Obtener la primera línea (headers)
  const lines = csvText.split("\n")
  const headers = lines[0].split(";")

  console.log("\n[v0] Columnas del CSV:")
  headers.forEach((header, index) => {
    console.log(`  ${index + 1}. "${header.trim()}"`)
  })

  // Mostrar las primeras 3 filas de datos
  console.log("\n[v0] Primeras 3 filas de datos:")
  for (let i = 1; i <= 3 && i < lines.length; i++) {
    const values = lines[i].split(";")
    console.log(`\nFila ${i}:`)
    headers.forEach((header, index) => {
      console.log(`  ${header.trim()}: "${values[index]?.trim() || ""}"`)
    })
  }

  // Verificar el mapeo
  console.log("\n[v0] Verificando mapeo de columnas:")
  const mapping = sources.column_mapping as Record<string, string>

  Object.entries(mapping).forEach(([field, csvColumn]) => {
    const columnExists = headers.some((h) => h.trim() === csvColumn)
    const status = columnExists ? "✓" : "✗"
    console.log(`  ${status} ${field} → "${csvColumn}" ${columnExists ? "" : "(NO EXISTE EN CSV)"}`)
  })
}

checkArnoiaCSV()
