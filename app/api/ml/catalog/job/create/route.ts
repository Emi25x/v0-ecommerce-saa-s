import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

// POST /api/ml/catalog/job/create
// Crea un job + job_items con las acciones sugeridas por la auditoría
// Body: { account_id, mode: 'dry_run'|'live', resolved_items: [] }
// resolved_items viene de /api/ml/catalog/resolve
export async function POST(req: NextRequest) {
  const { account_id, mode = "dry_run", resolved_items } = await req.json()

  if (!account_id || !resolved_items?.length) {
    return NextResponse.json({ error: "account_id y resolved_items requeridos" }, { status: 400 })
  }

  if (!["dry_run", "live"].includes(mode)) {
    return NextResponse.json({ error: "mode debe ser dry_run o live" }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Crear el job
  const { data: job, error: jobErr } = await supabase
    .from("ml_catalog_jobs")
    .insert({
      account_id,
      mode,
      status: "idle",
      total_target: resolved_items.length,
    })
    .select()
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message || "Error creando job" }, { status: 500 })
  }

  // Crear los items del job
  const itemsToInsert = resolved_items.map((item: any) => ({
    job_id: job.id,
    old_item_id: item.ml_item_id,
    ean: item.ean || null,
    catalog_product_id: item.catalog_product_id || null,
    action: item.action,
    status: "pending",
  }))

  const { error: itemsErr } = await supabase
    .from("ml_catalog_job_items")
    .insert(itemsToInsert)

  if (itemsErr) {
    // Limpiar job si falló la inserción de items
    await supabase.from("ml_catalog_jobs").delete().eq("id", job.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, job_id: job.id, mode, total: resolved_items.length })
}
