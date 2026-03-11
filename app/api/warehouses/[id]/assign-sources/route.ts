import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/warehouses/[id]/assign-sources
 * Vincula fuentes de importación a un almacén y hace backfill de stock_by_source
 * para los productos que aún no tienen ninguna fuente asignada (stock_by_source vacío).
 *
 * Usa source.id como clave (igual que mergeStockBySource en lib/stock-helpers).
 * Solo backfilla productos con stock_by_source NULL o {} para evitar doble conteo.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()
    const { id: warehouseId } = await params

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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

    // 1. Asignar warehouse_id a las fuentes
    const { error: updateError } = await supabase
      .from("import_sources")
      .update({ warehouse_id: warehouseId })
      .in("id", source_ids)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // 2. Backfill usando el PRIMER source como clave para los productos aún sin fuente asignada.
    //    Solo productos con stock_by_source NULL o vacío ({}) para evitar doble conteo.
    //    Los productos ya atribuidos a otra fuente se saltean.
    const primarySourceId = source_ids[0]
    let backfilled = 0
    const CHUNK = 1000
    let offset = 0
    const FETCH_LIMIT = 10000

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: prods } = await supabaseAdmin
        .from("products")
        .select("id, stock, stock_by_source")
        .gt("stock", 0)
        // Solo productos sin ninguna clave en stock_by_source
        .or("stock_by_source.is.null,stock_by_source.eq.{}")
        .range(offset, offset + FETCH_LIMIT - 1)
        .order("id")

      if (!prods || prods.length === 0) break

      for (let i = 0; i < prods.length; i += CHUNK) {
        const batch = prods.slice(i, i + CHUNK)
        const updates = batch.map((p: any) => ({
          id: p.id,
          // Solo seteamos la clave del source; no recalculamos products.stock para no alterar el total
          stock_by_source: { [primarySourceId]: p.stock ?? 0 },
        }))
        await supabaseAdmin.from("products").upsert(updates, { onConflict: "id" })
        backfilled += batch.length
      }

      if (prods.length < FETCH_LIMIT) break
      offset += FETCH_LIMIT
    }

    return NextResponse.json({
      success: true,
      assigned_sources: source_ids.length,
      backfilled_products: backfilled,
      primary_source_id: primarySourceId,
      message: `${source_ids.length} fuente(s) vinculadas al almacén "${warehouse.name}". Backfill: ${backfilled} productos asignados.`,
    })
  } catch (error) {
    console.error("[ASSIGN-SOURCES]", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
