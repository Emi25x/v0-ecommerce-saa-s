import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

// GET /api/ml/catalog-migration/errors?jobId=UUID
// Devuelve items con migrate_status in (error, optin_failed) para mostrar en el modal.
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId")
  if (!jobId) return NextResponse.json({ error: "jobId requerido" }, { status: 400 })

  const supabase = createAdminClient()

  const { data: items, error } = await supabase
    .from("ml_catalog_migration_items")
    .select("item_id, ean, migrate_status, error")
    .eq("job_id", jobId)
    .in("migrate_status", ["error", "optin_failed"])
    .order("item_id")
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, items: items ?? [] })
}
