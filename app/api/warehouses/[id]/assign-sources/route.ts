import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/warehouses/[id]/assign-sources
 * Vincula fuentes de importación a un almacén y hace backfill de stock_by_source
 * para los productos que ya existen en esas fuentes.
 *
 * Body: { source_ids: string[] }
 *
 * El backfill solo aplica a fuentes "azeta" y "arnoia" (stock_by_source).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: warehouseId } = await params

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify warehouse belongs to user
    const { data: warehouse, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id, name")
      .eq("id", warehouseId)
      .eq("owner_user_id", user.id)
      .single()

    if (warehouseError || !warehouse) {
      return NextResponse.json({ error: "Almacén no encontrado" }, { status: 404 })
    }

    const body = await request.json()
    const { source_ids } = body as { source_ids: string[] }

    if (!source_ids || source_ids.length === 0) {
      return NextResponse.json({ error: "source_ids requerido" }, { status: 400 })
    }

    // Asignar warehouse_id a las fuentes seleccionadas
    const { error: updateError } = await supabase
      .from("import_sources")
      .update({ warehouse_id: warehouseId })
      .in("id", source_ids)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Backfill de stock_by_source para las fuentes vinculadas
    // Para cada fuente, el key en stock_by_source es el nombre normalizado
    const { data: sources } = await supabase
      .from("import_sources")
      .select("id, name")
      .in("id", source_ids)

    let backfilled = 0

    for (const source of sources ?? []) {
      const sourceKey = source.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")

      // Buscar productos que ya tienen stock de esta fuente en stock_by_source
      // o que tienen stock > 0 y la fuente es la principal (azeta, arnoia)
      if (sourceKey === "azeta") {
        // Azeta ya escribe stock_by_source.azeta - nada que backfillear
        continue
      }

      if (sourceKey.startsWith("arnoia")) {
        // Arnoia: backfill leyendo products.stock donde stock_by_source.arnoia no existe aún
        const { data: prodsToBackfill } = await supabase
          .from("products")
          .select("id, stock, stock_by_source")
          .gt("stock", 0)
          .is(`stock_by_source->arnoia`, null)
          .limit(10000)

        if (prodsToBackfill && prodsToBackfill.length > 0) {
          const CHUNK = 500
          for (let i = 0; i < prodsToBackfill.length; i += CHUNK) {
            const batch = prodsToBackfill.slice(i, i + CHUNK)
            const updates = batch.map((p: any) => ({
              id: p.id,
              stock_by_source: { ...(p.stock_by_source || {}), arnoia: p.stock ?? 0 },
            }))
            await supabase.from("products").upsert(updates, { onConflict: "id" })
            backfilled += batch.length
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      assigned_sources: source_ids.length,
      backfilled_products: backfilled,
      message: `${source_ids.length} fuente(s) vinculadas al almacén ${warehouse.name}. ${backfilled} productos con backfill.`,
    })
  } catch (error) {
    console.error("[ASSIGN-SOURCES]", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
