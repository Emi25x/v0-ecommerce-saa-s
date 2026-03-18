import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { createClient } from "@/lib/db/server"

/**
 * GET  → checks if warehouse_id column exists on import_sources
 * POST → applies the migration (adds the column) if missing
 */

async function columnExists(adminSupabase: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { data } = await adminSupabase
    .from("information_schema.columns" as any)
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "import_sources")
    .eq("column_name", "warehouse_id")
    .maybeSingle()
  return !!data
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = createAdminClient()
    const exists = await columnExists(admin)
    return NextResponse.json({ column_exists: exists })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = createAdminClient()

    // Check if already exists to avoid errors
    const exists = await columnExists(admin)
    if (exists) return NextResponse.json({ ok: true, message: "Column already exists" })

    // Apply migration via rpc exec_sql if available, otherwise return SQL for manual run
    const { error: rpcError } = await admin.rpc("exec_sql" as any, {
      sql: `
        ALTER TABLE import_sources
          ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_import_sources_warehouse
          ON import_sources(warehouse_id) WHERE warehouse_id IS NOT NULL;
      `,
    })

    if (rpcError) {
      // exec_sql not available — return the SQL for the user to run manually
      return NextResponse.json({
        ok: false,
        manual: true,
        sql: `ALTER TABLE import_sources ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;`,
        message: "Ejecuta el SQL en el dashboard de Supabase",
      })
    }

    return NextResponse.json({ ok: true, message: "Migration applied successfully" })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
