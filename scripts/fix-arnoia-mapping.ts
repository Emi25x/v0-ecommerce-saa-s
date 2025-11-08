import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function fixArnoiaMapping() {
  console.log('🔍 Consultando fuente "Arnoia Act"...')

  // Obtener la fuente "Arnoia Act"
  const { data: source, error: sourceError } = await supabase
    .from("inventory_sources")
    .select("*")
    .ilike("name", "%arnoia%act%")
    .single()

  if (sourceError || !source) {
    console.error("❌ Error al obtener la fuente:", sourceError)
    return
  }

  console.log("\n📋 Fuente encontrada:")
  console.log("ID:", source.id)
  console.log("Nombre:", source.name)
  console.log("URL:", source.csv_url)
  console.log("\n📝 Column Mapping actual:")
  console.log(JSON.stringify(source.column_mapping, null, 2))

  // Descargar el CSV
  console.log("\n⬇️  Descargando CSV...")
  const response = await fetch(source.csv_url)
  const csvText = await response.text()

  // Parsear las primeras líneas
  const lines = csvText.split("\n").filter((line) => line.trim())
  const headers = lines[0].split(";").map((h) => h.trim())

  console.log("\n📊 Columnas del CSV:")
  headers.forEach((header, index) => {
    console.log(`  ${index + 1}. "${header}"`)
  })

  console.log("\n📄 Primera fila de datos:")
  if (lines[1]) {
    const firstRow = lines[1].split(";").map((v) => v.trim())
    headers.forEach((header, index) => {
      console.log(`  ${header}: "${firstRow[index]}"`)
    })
  }

  // Buscar la columna del SKU
  console.log("\n🔍 Buscando columna del SKU...")
  const skuColumnIndex = headers.findIndex(
    (h) =>
      h.toLowerCase().includes("sku") || h.toLowerCase().includes("codigo") || h.toLowerCase().includes("referencia"),
  )

  if (skuColumnIndex === -1) {
    console.log("❌ No se encontró una columna obvia para el SKU")
    console.log("Por favor, identifica manualmente cuál columna contiene el SKU")
    return
  }

  const skuColumnName = headers[skuColumnIndex]
  console.log(`✅ Columna del SKU encontrada: "${skuColumnName}"`)

  // Crear el nuevo column_mapping
  const newMapping: any = {
    sku: skuColumnName,
  }

  // Buscar otras columnas comunes
  headers.forEach((header) => {
    const lower = header.toLowerCase()
    if (lower.includes("precio") || lower.includes("price")) {
      newMapping.price = header
    } else if (lower.includes("stock") || lower.includes("cantidad")) {
      newMapping.stock = header
    } else if (lower.includes("nombre") || lower.includes("name") || lower.includes("titulo")) {
      newMapping.name = header
    } else if (lower.includes("descripcion") || lower.includes("description")) {
      newMapping.description = header
    }
  })

  console.log("\n📝 Nuevo Column Mapping propuesto:")
  console.log(JSON.stringify(newMapping, null, 2))

  // Actualizar la fuente
  console.log("\n💾 Actualizando fuente en la base de datos...")
  const { error: updateError } = await supabase
    .from("inventory_sources")
    .update({ column_mapping: newMapping })
    .eq("id", source.id)

  if (updateError) {
    console.error("❌ Error al actualizar:", updateError)
    return
  }

  console.log("✅ Fuente actualizada correctamente!")
  console.log("\n🎉 Ahora puedes ejecutar la importación nuevamente")
}

fixArnoiaMapping()
