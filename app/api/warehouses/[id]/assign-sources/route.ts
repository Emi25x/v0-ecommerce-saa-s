import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { createAdminClient } from "@/lib/db/admin"

/**
 * POST /api/warehouses/[id]/assign-sources
 * Sincroniza las fuentes vinculadas al almacén:
 *  - Vincula las fuentes seleccionadas (source_ids)
 *  - Desvincula las fuentes que tenían este warehouse_id pero ya no están en source_ids
 *  - Hace backfill de stock_by_source[primarySourceId] para productos aún no atribuidos
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // Si no hay fuentes seleccionadas, desvincular todo y salir
    // Usar admin client para import_sources (puede tener RLS sin policy para el user)
    if (!source_ids || source_ids.length === 0) {
      await supabaseAdmin.from("import_sources").update({ warehouse_id: null }).eq("warehouse_id", warehouseId)
      return NextResponse.json({
        success: true,
        assigned_sources: 0,
        backfilled_products: 0,
        message: `Fuentes desvinculadas del almacén "${warehouse.name}".`,
      })
    }

    // Desvincular fuentes de este warehouse que no están en la nueva lista
    const { data: currentLinked } = await supabaseAdmin
      .from("import_sources")
      .select("id")
      .eq("warehouse_id", warehouseId)

    const toUnlink = (currentLinked ?? []).map((s) => s.id).filter((id) => !source_ids.includes(id))

    if (toUnlink.length > 0) {
      await supabaseAdmin.from("import_sources").update({ warehouse_id: null }).in("id", toUnlink)
    }

    // Vincular las fuentes seleccionadas
    const { error: updateError } = await supabaseAdmin
      .from("import_sources")
      .update({ warehouse_id: warehouseId })
      .in("id", source_ids)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Backfill: asignar stock_by_source[source_key] para productos sin fuente asignada
    // Solo toca productos donde stock_by_source IS NULL o {} (vacío)
    // Usar source_key (clave corta) en lugar de UUID para compatibilidad con filtros JSONB
    const { data: primarySource } = await supabase
      .from("import_sources")
      .select("id, name, source_key")
      .eq("id", source_ids[0])
      .single()
    const primarySourceKey: string =
      (primarySource as any)?.source_key ?? primarySource?.name?.split(" ")[0].toLowerCase() ?? source_ids[0]
    let backfilled = 0
    const CHUNK = 1000
    let offset = 0
    const FETCH_LIMIT = 10000

    while (true) {
      // Fetch products with stock > 0 that don't yet have this source key in stock_by_source
      const { data: prods, error: fetchErr } = await supabaseAdmin
        .from("products")
        .select("id, stock, stock_by_source")
        .gt("stock", 0)
        .or(`stock_by_source.is.null,stock_by_source->>${primarySourceKey}.is.null`)
        .range(offset, offset + FETCH_LIMIT - 1)
        .order("id")

      if (fetchErr) {
        console.warn("[ASSIGN-SOURCES] backfill fetch error:", fetchErr.message)
        break
      }
      if (!prods || prods.length === 0) break

      for (let i = 0; i < prods.length; i += CHUNK) {
        const batch = prods.slice(i, i + CHUNK)
        const updates = batch.map((p: any) => ({
          id: p.id,
          // Merge with existing keys instead of replacing the whole object
          stock_by_source: { ...(p.stock_by_source ?? {}), [primarySourceKey]: p.stock ?? 0 },
        }))
        const { error: upsertErr } = await supabaseAdmin.from("products").upsert(updates, { onConflict: "id" })
        if (upsertErr) {
          console.warn("[ASSIGN-SOURCES] backfill upsert error:", upsertErr.message)
        } else {
          backfilled += batch.length
        }
      }

      if (prods.length < FETCH_LIMIT) break
      offset += FETCH_LIMIT
    }

    return NextResponse.json({
      success: true,
      assigned_sources: source_ids.length,
      backfilled_products: backfilled,
      primary_source_key: primarySourceKey,
      message: `${source_ids.length} fuente(s) vinculadas al almacén "${warehouse.name}". Backfill: ${backfilled} productos.`,
    })
  } catch (error) {
    console.error("[ASSIGN-SOURCES]", error)
    return NextResponse.json({ error: "Error interno", detail: String(error) }, { status: 500 })
  }
}
