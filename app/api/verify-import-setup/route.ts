export const dynamic = "force-dynamic"

import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const results = {
    timestamp: new Date().toISOString(),
    checks: [] as Array<{ name: string; status: "✅ OK" | "❌ ERROR" | "⚠️ WARNING"; details: string }>,
  }

  // 1. Verificar constraint UNIQUE en SKU
  console.log("[v0] Verificando constraint UNIQUE en SKU...")
  const { data: constraints, error: constraintsError } = await supabase.rpc("get_table_constraints", {
    table_name: "products",
  })

  if (constraintsError) {
    // Si la función no existe, intentar query directo
    const { data: constraintsAlt } = await supabase
      .from("information_schema.table_constraints")
      .select("*")
      .eq("table_name", "products")
      .eq("constraint_type", "UNIQUE")

    const hasUniqueConstraint = constraintsAlt?.some((c: any) => c.column_name === "sku")
    results.checks.push({
      name: "Constraint UNIQUE en SKU",
      status: hasUniqueConstraint ? "✅ OK" : "❌ ERROR",
      details: hasUniqueConstraint
        ? "La constraint UNIQUE existe en el campo SKU"
        : "FALTA: Ejecuta el script 007_add_sku_unique_constraint.sql",
    })
  } else {
    const hasUniqueConstraint = constraints?.some((c: any) => c.column_name === "sku")
    results.checks.push({
      name: "Constraint UNIQUE en SKU",
      status: hasUniqueConstraint ? "✅ OK" : "❌ ERROR",
      details: hasUniqueConstraint
        ? "La constraint UNIQUE existe en el campo SKU"
        : "FALTA: Ejecuta el script 007_add_sku_unique_constraint.sql",
    })
  }

  // 2. Verificar campo custom_fields
  console.log("[v0] Verificando campo custom_fields...")
  const { data: columns, error: columnsError } = await supabase
    .from("information_schema.columns")
    .select("column_name, data_type")
    .eq("table_name", "products")

  if (columnsError) {
    results.checks.push({
      name: "Campo custom_fields",
      status: "❌ ERROR",
      details: `Error al verificar columnas: ${columnsError.message}`,
    })
  } else {
    const hasCustomFields = columns?.some((c: any) => c.column_name === "custom_fields" && c.data_type === "jsonb")
    results.checks.push({
      name: "Campo custom_fields (JSONB)",
      status: hasCustomFields ? "✅ OK" : "❌ ERROR",
      details: hasCustomFields
        ? "El campo custom_fields existe y es tipo JSONB"
        : "FALTA: Ejecuta el script 008_add_custom_fields_to_products.sql",
    })
  }

  // 3. Probar upsert con producto de prueba
  console.log("[v0] Probando upsert...")
  const testProduct = {
    sku: "TEST-VERIFY-" + Date.now(),
    title: "Producto de Prueba - Verificación",
    description: "Este es un producto de prueba para verificar que el upsert funciona",
    price: 99.99,
    stock: 10,
    internal_code: "INT-TEST-" + Date.now(),
    custom_fields: {
      altura: 100,
      ancho: 50,
      test: true,
    },
  }

  const { data: upsertData, error: upsertError } = await supabase
    .from("products")
    .upsert(testProduct, { onConflict: "sku" })
    .select()

  if (upsertError) {
    results.checks.push({
      name: "Prueba de Upsert",
      status: "❌ ERROR",
      details: `Error al hacer upsert: ${upsertError.message}`,
    })
  } else {
    results.checks.push({
      name: "Prueba de Upsert",
      status: "✅ OK",
      details: `Upsert exitoso. Producto de prueba creado con SKU: ${testProduct.sku}`,
    })

    // Limpiar producto de prueba
    await supabase.from("products").delete().eq("sku", testProduct.sku)
  }

  // 4. Contar productos actuales
  console.log("[v0] Contando productos...")
  const { count: productCount, error: countError } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })

  if (countError) {
    results.checks.push({
      name: "Productos en Base de Datos",
      status: "⚠️ WARNING",
      details: `Error al contar productos: ${countError.message}`,
    })
  } else {
    results.checks.push({
      name: "Productos en Base de Datos",
      status: "✅ OK",
      details: `Hay ${productCount || 0} productos en la base de datos`,
    })
  }

  // 5. Verificar fuentes de importación
  console.log("[v0] Verificando fuentes de importación...")
  const { data: sources, error: sourcesError } = await supabase.from("import_sources").select("name, feed_type, url")

  if (sourcesError) {
    results.checks.push({
      name: "Fuentes de Importación",
      status: "⚠️ WARNING",
      details: `Error al obtener fuentes: ${sourcesError.message}`,
    })
  } else {
    results.checks.push({
      name: "Fuentes de Importación",
      status: "✅ OK",
      details: `Hay ${sources?.length || 0} fuentes configuradas: ${sources?.map((s) => s.name).join(", ") || "ninguna"}`,
    })
  }

  // Resumen
  const hasErrors = results.checks.some((c) => c.status === "❌ ERROR")
  const summary = hasErrors
    ? "⚠️ HAY ERRORES QUE DEBEN CORREGIRSE ANTES DE IMPORTAR"
    : "✅ TODO ESTÁ CONFIGURADO CORRECTAMENTE - PUEDES PROCEDER CON LA IMPORTACIÓN"

  return NextResponse.json({
    summary,
    ...results,
  })
}
