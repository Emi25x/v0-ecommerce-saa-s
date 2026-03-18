import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("carriers")
    .select("id, name, slug, description, active, config, created_at")
    .order("name")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
