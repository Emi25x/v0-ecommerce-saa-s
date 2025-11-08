import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function diagnoseCsv() {
  console.log("=== DIAGNÓSTICO DE CSV ARNOIA ACT ===\n")

  // 1. Obtener configuración de la fuente
  const { data: source, error: sourceError } = await supabase
    .from("import_sources")
    .select("*")
    .ilike("name", "%arnoia%act%")
    .single()

  if (sourceError || !source) {
    console.error("❌ Error obteniendo fuente:", sourceError)
    return
  }

  console.log("✅ Fuente encontrada:", source.name)
  console.log("📋 Column mapping configurado:")
  console.log(JSON.stringify(source.column_mapping, null, 2))
  console.log("\n📍 URL del CSV:", source.url_template)

  if (!source.url_template) {
    console.error("❌ La fuente no tiene URL configurada")
    return
  }

  // 2. Descargar CSV
  console.log("\n⬇️  Descargando CSV...")
  const response = await fetch(source.url_template)
  if (!response.ok) {
    console.error("❌ Error descargando CSV:", response.statusText)
    return
  }

  const csvText = await response.text()
  const lines = csvText.split("\n").filter((line) => line.trim())

  console.log(`✅ CSV descargado: ${lines.length} líneas (incluyendo header)`)

  // 3. Analizar headers
  const headers = lines[0].split(";").map((h) => h.trim().replace(/^"|"$/g, ""))
  console.log("\n📊 Columnas del CSV:")
  headers.forEach((header, index) => {
    console.log(`  ${index + 1}. "${header}"`)
  })

  // 4. Verificar mapeo
  console.log("\n🔍 Verificación del mapeo:")
  for (const [field, columnName] of Object.entries(source.column_mapping)) {
    const exists = headers.includes(columnName as string)
    const status = exists ? "✅" : "❌"
    console.log(`  ${status} ${field} → "${columnName}" ${exists ? "(existe)" : "(NO EXISTE)"}`)
  }

  // 5. Mostrar primeras 3 filas de datos
  console.log("\n📄 Primeras 3 filas de datos:")
  for (let i = 1; i <= Math.min(3, lines.length - 1); i++) {
    console.log(`\n--- Fila ${i} ---`)
    const values = lines[i].split(";").map((v) => v.trim().replace(/^"|"$/g, ""))
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index] || ""
    })

    // Mostrar solo los campos mapeados
    for (const [field, columnName] of Object.entries(source.column_mapping)) {
      const value = row[columnName as string] || "(vacío)"
      console.log(`  ${field}: ${value}`)
    }
  }

  // 6. Sugerencias de mapeo
  console.log("\n💡 Sugerencias de mapeo:")
  const skuCandidates = headers.filter((h) => /sku|codigo|code|ref|referencia/i.test(h))
  if (skuCandidates.length > 0) {
    console.log("  Posibles columnas para SKU:", skuCandidates.join(", "))
  }

  const nameCandidates = headers.filter((h) => /nombre|name|titulo|title|descripcion|description/i.test(h))
  if (nameCandidates.length > 0) {
    console.log("  Posibles columnas para nombre:", nameCandidates.join(", "))
  }

  const priceCandidates = headers.filter((h) => /precio|price|pvp|tarifa/i.test(h))
  if (priceCandidates.length > 0) {
    console.log("  Posibles columnas para precio:", priceCandidates.join(", "))
  }

  const stockCandidates = headers.filter((h) => /stock|cantidad|quantity|existencia/i.test(h))
  if (stockCandidates.length > 0) {
    console.log("  Posibles columnas para stock:", stockCandidates.join(", "))
  }
}

diagnoseCsv().catch(console.error)
