import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("import_sources")
    .select("id, name, description, url_template, auth_type, credentials, feed_type, column_mapping, is_active, delimiter")
    .order("name")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const payload = {
    version: "1.0",
    exported_at: new Date().toISOString(),
    sources: data,
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="import_sources_${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
