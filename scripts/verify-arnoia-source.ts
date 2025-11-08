import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function verifyArnoiaSource() {
  console.log("🔍 Verificando configuración de la fuente Arnoia...\n")

  // 1. Obtener la configuración de la fuente
  const { data: source, error: sourceError } = await supabase
    .from("import_sources")
    .select("*")
    .ilike("name", "%arnoia%")
    .single()

  if (sourceError || !source) {
    console.error("❌ Error al obtener la fuente:", sourceError)
    return
  }

  console.log("✅ Fuente encontrada:")
  console.log("   ID:", source.id)
  console.log("   Nombre:", source.name)
  console.log("   URL:", source.url_template)
  console.log("   Activa:", source.is_active)
  console.log("   Última importación:", source.last_import_at)
  console.log("\n📋 Column Mapping:")
  console.log(JSON.stringify(source.column_mapping, null, 2))

  // 2. Descargar el CSV y verificar estructura
  console.log("\n📥 Descargando CSV...")
  try {
    const response = await fetch(source.url_template)
    if (!response.ok) {
      console.error("❌ Error al descargar CSV:", response.status, response.statusText)
      return
    }

    const csvText = await response.text()
    const lines = csvText.split("\n").filter((line) => line.trim())

    console.log("✅ CSV descargado exitosamente")
    console.log("   Total de líneas:", lines.length)
    console.log("   Total de productos (aprox):", lines.length - 1)

    // Obtener headers
    const headers = lines[0].split(";").map((h) => h.trim().replace(/"/g, ""))
    console.log("\n📊 Columnas del CSV:")
    headers.forEach((header, index) => {
      console.log(`   ${index + 1}. ${header}`)
    })

    // Verificar mapeo
    console.log("\n🔍 Verificando mapeo de columnas:")
    const mapping = source.column_mapping as Record<string, string>

    const requiredFields = ["sku", "stock", "price"]
    const optionalFields = ["title", "description", "brand", "category", "image_url"]

    for (const field of requiredFields) {
      const csvColumn = mapping[field]
      if (!csvColumn) {
        console.log(`   ❌ Campo requerido "${field}" no está mapeado`)
      } else if (!headers.includes(csvColumn)) {
        console.log(`   ❌ Campo "${field}" mapeado a "${csvColumn}" pero esa columna no existe en el CSV`)
      } else {
        console.log(`   ✅ Campo "${field}" → "${csvColumn}"`)
      }
    }

    for (const field of optionalFields) {
      const csvColumn = mapping[field]
      if (csvColumn && !headers.includes(csvColumn)) {
        console.log(`   ⚠️  Campo opcional "${field}" mapeado a "${csvColumn}" pero esa columna no existe en el CSV`)
      } else if (csvColumn) {
        console.log(`   ✅ Campo "${field}" → "${csvColumn}"`)
      }
    }

    // Mostrar primera fila de datos
    if (lines.length > 1) {
      console.log("\n📄 Primera fila de datos:")
      const firstDataRow = lines[1].split(";").map((v) => v.trim().replace(/"/g, ""))
      headers.forEach((header, index) => {
        const value = firstDataRow[index] || ""
        console.log(`   ${header}: ${value.substring(0, 50)}${value.length > 50 ? "..." : ""}`)
      })
    }

    // Verificar productos en la BD
    const { count } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .contains("source", [source.name])

    console.log("\n💾 Productos en la base de datos:")
    console.log('   Total con fuente "' + source.name + '":', count)
  } catch (error) {
    console.error("❌ Error al procesar CSV:", error)
  }
}

verifyArnoiaSource()
