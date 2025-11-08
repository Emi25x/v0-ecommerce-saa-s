import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

console.log("🔍 VERIFICANDO CONFIGURACIÓN DE LA FUENTE ARNOIA")
console.log("=".repeat(60))

// 1. Consultar configuración de la fuente
const { data: source, error: sourceError } = await supabase
  .from("import_sources")
  .select("*")
  .ilike("name", "%arnoia%")
  .single()

if (sourceError || !source) {
  console.error("❌ Error al consultar la fuente:", sourceError)
  process.exit(1)
}

console.log("\n📋 CONFIGURACIÓN DE LA FUENTE:")
console.log("ID:", source.id)
console.log("Nombre:", source.name)
console.log("Tipo:", source.feed_type)
console.log("URL:", source.url_template)
console.log("Activa:", source.is_active)
console.log("Última importación:", source.last_import_at)

console.log("\n🗺️  MAPEO DE COLUMNAS:")
console.log(JSON.stringify(source.column_mapping, null, 2))

// 2. Descargar el CSV y verificar columnas
console.log("\n📥 DESCARGANDO CSV...")
try {
  const response = await fetch(source.url_template)
  if (!response.ok) {
    console.error(`❌ Error al descargar CSV: HTTP ${response.status}`)
    process.exit(1)
  }

  const csvText = await response.text()
  const lines = csvText.split("\n").filter((line) => line.trim())

  if (lines.length === 0) {
    console.error("❌ El CSV está vacío")
    process.exit(1)
  }

  // Obtener encabezados
  const headers = lines[0].split(";").map((h) => h.trim().replace(/^"|"$/g, ""))

  console.log("\n📊 COLUMNAS DEL CSV:")
  headers.forEach((header, index) => {
    console.log(`  ${index + 1}. ${header}`)
  })

  console.log(`\n📈 Total de líneas en el CSV: ${lines.length - 1} productos`)

  // 3. Verificar que el mapeo coincida con las columnas
  console.log("\n✅ VERIFICACIÓN DEL MAPEO:")
  const mapping = source.column_mapping
  let allValid = true

  for (const [field, csvColumn] of Object.entries(mapping)) {
    if (typeof csvColumn === "string" && csvColumn !== "") {
      const exists = headers.includes(csvColumn)
      const status = exists ? "✅" : "❌"
      console.log(`  ${status} ${field}: "${csvColumn}" ${exists ? "existe" : "NO EXISTE"}`)
      if (!exists) allValid = false
    }
  }

  // 4. Mostrar primera fila de datos como ejemplo
  if (lines.length > 1) {
    console.log("\n📝 PRIMERA FILA DE DATOS (ejemplo):")
    const firstDataLine = lines[1].split(";").map((v) => v.trim().replace(/^"|"$/g, ""))
    headers.forEach((header, index) => {
      const value = firstDataLine[index] || ""
      console.log(`  ${header}: "${value}"`)
    })
  }

  // 5. Consultar productos importados
  const { count: productCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .contains("source", [source.name])

  console.log(`\n📦 PRODUCTOS IMPORTADOS: ${productCount || 0}`)

  // 6. Consultar historial de importaciones
  const { data: history } = await supabase
    .from("import_history")
    .select("*")
    .eq("source_id", source.id)
    .order("started_at", { ascending: false })
    .limit(5)

  if (history && history.length > 0) {
    console.log("\n📜 ÚLTIMAS 5 IMPORTACIONES:")
    history.forEach((h, i) => {
      console.log(`\n  ${i + 1}. ${h.started_at}`)
      console.log(`     Estado: ${h.status}`)
      console.log(`     Importados: ${h.products_imported || 0}`)
      console.log(`     Actualizados: ${h.products_updated || 0}`)
      console.log(`     Fallidos: ${h.products_failed || 0}`)
      if (h.error_message) {
        console.log(`     Error: ${h.error_message}`)
      }
    })
  }

  // Resultado final
  console.log("\n" + "=".repeat(60))
  if (allValid) {
    console.log("✅ LA CONFIGURACIÓN ES CORRECTA")
    console.log("   Todas las columnas del mapeo existen en el CSV")
  } else {
    console.log("❌ HAY PROBLEMAS CON LA CONFIGURACIÓN")
    console.log("   Algunas columnas del mapeo NO existen en el CSV")
    console.log("   Debes actualizar el column_mapping de la fuente")
  }
  console.log("=".repeat(60))
} catch (error) {
  console.error("❌ Error al procesar el CSV:", error)
  process.exit(1)
}
