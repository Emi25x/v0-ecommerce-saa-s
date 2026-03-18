import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * GET  /api/fix-ean-constraint         → diagnosticar (solo lectura)
 * POST /api/fix-ean-constraint?apply=1 → limpiar duplicados + crear UNIQUE index
 *
 * PROBLEMA:  todos los upsert(..., { onConflict: "ean" }) fallan porque la
 *            columna products.ean NO tiene UNIQUE constraint/index.
 * SOLUCIÓN:  eliminar filas duplicadas por ean, crear UNIQUE INDEX parcial.
 */

export async function GET() {
  const supabase = createAdminClient()
  const diag: Record<string, any> = {}

  // 1. ¿Existe la columna ean?
  const { data: cols } = await supabase
    .from("information_schema.columns")
    .select("column_name, data_type, is_nullable")
    .eq("table_name", "products")
    .in("column_name", ["ean", "sku", "title"])

  diag.columns = cols

  // 2. ¿Hay UNIQUE index/constraint en ean?
  const { data: idxRows } = await supabase.rpc("exec_sql", {
    query: `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'products'
        AND indexdef ILIKE '%ean%'
      ORDER BY indexname
    `,
  }).catch(() => ({ data: null }))

  // Fallback: intentar con consulta directa
  if (!idxRows) {
    // Si la función exec_sql no existe, probamos un test upsert
    const testEan = "__DIAG_TEST_" + Date.now()
    const { error: testErr1 } = await supabase
      .from("products")
      .upsert({ sku: testEan, ean: testEan, title: "test" }, { onConflict: "ean" })

    if (testErr1) {
      diag.ean_unique_status = "MISSING"
      diag.upsert_test_error = testErr1.message
      diag.explanation = "El upsert con onConflict='ean' falla porque NO existe UNIQUE constraint en ean. ESTE ES EL PROBLEMA."
    } else {
      diag.ean_unique_status = "OK"
      // Limpiar
      await supabase.from("products").delete().eq("ean", testEan)
    }
  } else {
    const hasUnique = idxRows.some((r: any) =>
      (r.indexdef || "").toUpperCase().includes("UNIQUE")
    )
    diag.ean_indexes = idxRows
    diag.ean_unique_status = hasUnique ? "OK" : "MISSING"
    if (!hasUnique) {
      diag.explanation = "Hay un INDEX regular en ean pero NO un UNIQUE index. Los upsert con onConflict='ean' fallan."
    }
  }

  // 3. Contar duplicados
  const { data: dupCount } = await supabase.rpc("exec_sql", {
    query: `
      SELECT COUNT(*) as dup_groups,
             SUM(cnt - 1) as extra_rows
      FROM (
        SELECT ean, COUNT(*) as cnt
        FROM products
        WHERE ean IS NOT NULL AND ean != ''
        GROUP BY ean
        HAVING COUNT(*) > 1
      ) d
    `,
  }).catch(() => ({ data: null }))

  if (dupCount && dupCount[0]) {
    diag.duplicate_ean_groups = dupCount[0].dup_groups
    diag.duplicate_extra_rows = dupCount[0].extra_rows
  } else {
    diag.duplicates_note = "No se pudo consultar duplicados (exec_sql no disponible). Ejecuta el SQL manualmente."
  }

  // 4. Contar total de productos
  const { count } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
  diag.total_products = count

  diag.fix_instructions = diag.ean_unique_status === "MISSING"
    ? "Ejecuta POST /api/fix-ean-constraint?apply=1 para limpiar duplicados y crear el UNIQUE index. O ejecuta scripts/050_add_ean_unique_constraint.sql manualmente en Supabase."
    : "El UNIQUE constraint ya existe. Los imports deberían funcionar."

  return NextResponse.json(diag)
}

export async function POST(request: NextRequest) {
  const apply = request.nextUrl.searchParams.get("apply")

  if (apply !== "1") {
    return NextResponse.json({
      error: "Agrega ?apply=1 para confirmar la operación",
      warning: "Esto eliminará filas duplicadas por EAN (quedando la más reciente) y creará un UNIQUE index",
    }, { status: 400 })
  }

  const supabase = createAdminClient()
  const results: string[] = []

  // Paso 1: verificar si ya existe el unique index
  const testEan = "__FIX_TEST_" + Date.now()
  const { error: testErr } = await supabase
    .from("products")
    .upsert({ sku: testEan, ean: testEan, title: "test" }, { onConflict: "ean" })

  if (!testErr) {
    await supabase.from("products").delete().eq("ean", testEan)
    return NextResponse.json({
      message: "El UNIQUE constraint en EAN ya existe. No se necesita reparación.",
      results: ["upsert test: OK"],
    })
  }

  results.push(`upsert test falló: ${testErr.message}`)

  // Paso 2: eliminar duplicados via SQL
  const { data: delResult, error: delError } = await supabase.rpc("exec_sql", {
    query: `
      DELETE FROM products
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY ean
                   ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
                 ) as rn
          FROM products
          WHERE ean IS NOT NULL AND ean != ''
        ) dupes
        WHERE rn > 1
      )
    `,
  }).catch(async (e) => {
    // Si exec_sql no existe, intentar con approach alternativa
    results.push("exec_sql no disponible, limpiando duplicados con approach iterativa...")

    // Obtener todos los EANs duplicados
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, ean, updated_at")
      .not("ean", "is", null)
      .neq("ean", "")
      .order("ean")
      .order("updated_at", { ascending: false })

    if (!allProducts || allProducts.length === 0) {
      return { data: null, error: { message: "No products found" } }
    }

    // Encontrar duplicados
    const seen = new Map<string, string>() // ean -> id (el primero que vemos es el más reciente)
    const toDelete: string[] = []

    for (const p of allProducts) {
      if (!p.ean) continue
      if (seen.has(p.ean)) {
        toDelete.push(p.id)
      } else {
        seen.set(p.ean, p.id)
      }
    }

    if (toDelete.length > 0) {
      // Eliminar en batches
      for (let i = 0; i < toDelete.length; i += 500) {
        const batch = toDelete.slice(i, i + 500)
        await supabase.from("products").delete().in("id", batch)
      }
      results.push(`Eliminados ${toDelete.length} duplicados`)
    } else {
      results.push("No se encontraron duplicados")
    }

    return { data: null, error: null }
  })

  if (delError) {
    results.push(`Error limpiando duplicados: ${delError.message}`)
  } else if (delResult) {
    results.push(`Duplicados limpiados via SQL`)
  }

  // Paso 3: crear UNIQUE INDEX
  const { error: idxError } = await supabase.rpc("exec_sql", {
    query: `CREATE UNIQUE INDEX IF NOT EXISTS products_ean_unique ON products (ean) WHERE ean IS NOT NULL AND ean != ''`,
  }).catch(async () => {
    // Si exec_sql no existe, devolver instrucciones
    results.push("IMPORTANTE: No se pudo crear el UNIQUE INDEX automáticamente (función exec_sql no existe).")
    results.push("Ejecuta este SQL manualmente en Supabase SQL Editor:")
    results.push("CREATE UNIQUE INDEX IF NOT EXISTS products_ean_unique ON products (ean) WHERE ean IS NOT NULL AND ean != '';")
    return { error: null }
  })

  if (idxError) {
    results.push(`Error creando index: ${idxError.message}`)
  } else {
    results.push("UNIQUE INDEX creado (o instrucciones proporcionadas)")
  }

  // Paso 4: verificar que ahora funciona
  const { error: testErr2 } = await supabase
    .from("products")
    .upsert({ sku: testEan, ean: testEan, title: "test" }, { onConflict: "ean" })

  if (testErr2) {
    results.push(`Verificación post-fix FALLÓ: ${testErr2.message}`)
    results.push("Debes ejecutar el SQL manualmente en Supabase SQL Editor")
  } else {
    await supabase.from("products").delete().eq("ean", testEan)
    results.push("Verificación post-fix: OK - upsert con onConflict='ean' funciona correctamente")
  }

  return NextResponse.json({ results })
}
