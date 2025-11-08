import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function verifyAndTest() {
  console.log("=== VERIFICACIÓN COMPLETA DEL SISTEMA DE IMPORTACIÓN ===\n")

  // 1. Verificar que la tabla products existe
  console.log("1. Verificando tabla products...")
  const { data: tables, error: tablesError } = await supabase.from("products").select("*").limit(1)

  if (tablesError) {
    console.error("❌ Error: La tabla products no existe o no es accesible")
    console.error(tablesError)
    return
  }
  console.log("✅ Tabla products existe\n")

  // 2. Verificar constraint UNIQUE en SKU
  console.log("2. Verificando constraint UNIQUE en campo SKU...")
  const { data: constraints, error: constraintsError } = await supabase.rpc("exec_sql", {
    sql: `
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'products' AND constraint_type = 'UNIQUE'
      `,
  })

  // Intentar insertar un producto de prueba para verificar el constraint
  const testSku = `TEST-${Date.now()}`
  const { error: insertError1 } = await supabase.from("products").insert({
    sku: testSku,
    title: "Producto de prueba",
    internal_code: `INT-TEST-${Date.now()}`,
  })

  if (insertError1) {
    console.error("❌ Error insertando producto de prueba:", insertError1.message)
    console.log("\n⚠️  ACCIÓN REQUERIDA: Ejecuta el script 007_add_sku_unique_constraint.sql\n")
  } else {
    // Intentar insertar el mismo SKU de nuevo
    const { error: insertError2 } = await supabase.from("products").insert({
      sku: testSku,
      title: "Producto duplicado",
      internal_code: `INT-TEST2-${Date.now()}`,
    })

    if (insertError2 && insertError2.message.includes("duplicate")) {
      console.log("✅ Constraint UNIQUE en SKU funciona correctamente")

      // Limpiar producto de prueba
      await supabase.from("products").delete().eq("sku", testSku)
    } else {
      console.error("❌ Constraint UNIQUE en SKU NO existe o no funciona correctamente")
      console.log("\n⚠️  ACCIÓN REQUERIDA: Ejecuta el script 007_add_sku_unique_constraint.sql\n")

      // Limpiar productos de prueba
      await supabase.from("products").delete().eq("sku", testSku)
    }
  }

  // 3. Verificar campo custom_fields
  console.log("\n3. Verificando campo custom_fields (JSONB)...")
  const testSku2 = `TEST-CF-${Date.now()}`
  const { error: customFieldsError } = await supabase.from("products").insert({
    sku: testSku2,
    title: "Producto con campos personalizados",
    internal_code: `INT-CF-${Date.now()}`,
    custom_fields: {
      altura: "10cm",
      marca: "Nike",
      color: "Rojo",
    },
  })

  if (customFieldsError) {
    console.error("❌ Error: El campo custom_fields no existe:", customFieldsError.message)
    console.log("\n⚠️  ACCIÓN REQUERIDA: Ejecuta el script 008_add_custom_fields_to_products.sql\n")
  } else {
    // Verificar que se guardó correctamente
    const { data: verifyData, error: verifyError } = await supabase
      .from("products")
      .select("custom_fields")
      .eq("sku", testSku2)
      .single()

    if (verifyError || !verifyData || !verifyData.custom_fields || verifyData.custom_fields.altura !== "10cm") {
      console.error("❌ Error: Los campos personalizados no se guardaron correctamente")
    } else {
      console.log("✅ Campo custom_fields funciona correctamente")
      console.log("   Ejemplo guardado:", JSON.stringify(verifyData.custom_fields))
    }

    // Limpiar producto de prueba
    await supabase.from("products").delete().eq("sku", testSku2)
  }

  // 4. Probar upsert
  console.log("\n4. Probando funcionalidad de upsert...")
  const testSku3 = `TEST-UPSERT-${Date.now()}`

  // Insertar producto inicial
  const { error: upsertError1 } = await supabase.from("products").upsert(
    {
      sku: testSku3,
      title: "Producto inicial",
      price: 100,
      internal_code: `INT-UPSERT-${Date.now()}`,
    },
    { onConflict: "sku" },
  )

  if (upsertError1) {
    console.error("❌ Error en primer upsert:", upsertError1.message)
  } else {
    // Actualizar el mismo producto
    const { error: upsertError2 } = await supabase.from("products").upsert(
      {
        sku: testSku3,
        title: "Producto actualizado",
        price: 200,
      },
      { onConflict: "sku" },
    )

    if (upsertError2) {
      console.error("❌ Error en segundo upsert:", upsertError2.message)
    } else {
      // Verificar que se actualizó
      const { data: verifyData, error: verifyError } = await supabase
        .from("products")
        .select("title, price")
        .eq("sku", testSku3)
        .single()

      if (verifyError || !verifyData || verifyData.title !== "Producto actualizado" || verifyData.price !== 200) {
        console.error("❌ Error: El upsert no actualizó correctamente")
      } else {
        console.log("✅ Funcionalidad de upsert funciona correctamente")
        console.log(`   Producto actualizado: ${verifyData.title} - $${verifyData.price}`)
      }
    }

    // Limpiar producto de prueba
    await supabase.from("products").delete().eq("sku", testSku3)
  }

  // 5. Contar productos existentes
  console.log("\n5. Contando productos en la base de datos...")
  const { count, error: countError } = await supabase.from("products").select("*", { count: "exact", head: true })

  if (countError) {
    console.error("❌ Error contando productos:", countError.message)
  } else {
    console.log(`✅ Total de productos en la base de datos: ${count}`)

    if (count && count > 0) {
      // Mostrar algunos ejemplos
      const { data: examples, error: examplesError } = await supabase
        .from("products")
        .select("sku, title, price, stock, custom_fields")
        .limit(3)

      if (!examplesError && examples) {
        console.log("\n   Ejemplos de productos:")
        examples.forEach((p, i) => {
          console.log(`   ${i + 1}. SKU: ${p.sku}`)
          console.log(`      Título: ${p.title}`)
          console.log(`      Precio: $${p.price || "N/A"}`)
          console.log(`      Stock: ${p.stock || "N/A"}`)
          if (p.custom_fields && Object.keys(p.custom_fields).length > 0) {
            console.log(`      Campos personalizados: ${JSON.stringify(p.custom_fields)}`)
          }
          console.log("")
        })
      }
    }
  }

  // 6. Verificar fuentes de importación
  console.log("\n6. Verificando fuentes de importación...")
  const { data: sources, error: sourcesError } = await supabase
    .from("import_sources")
    .select("id, name, feed_type, column_mapping")

  if (sourcesError) {
    console.error("❌ Error obteniendo fuentes:", sourcesError.message)
  } else if (!sources || sources.length === 0) {
    console.log("⚠️  No hay fuentes de importación configuradas")
  } else {
    console.log(`✅ ${sources.length} fuente(s) de importación configurada(s):`)
    sources.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.name} (${s.feed_type})`)
      const mappingCount = Object.keys(s.column_mapping || {}).length
      console.log(`      Campos mapeados: ${mappingCount}`)
    })
  }

  console.log("\n=== VERIFICACIÓN COMPLETA ===\n")
  console.log("Si todos los checks tienen ✅, el sistema está listo para importar.")
  console.log("Si hay ❌, ejecuta los scripts indicados en la sección de Scripts.\n")
}

verifyAndTest()
