import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(req: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const source      = searchParams.get("source")
  const project_type = searchParams.get("project_type")
  const min_score   = parseFloat(searchParams.get("min_score") ?? "0")
  const only_adapt  = searchParams.get("only_adaptations") === "true"
  const limit       = Math.min(200, parseInt(searchParams.get("limit") ?? "100"))
  const offset      = parseInt(searchParams.get("offset") ?? "0")

  let q = supabase
    .from("editorial_radar_news")
    .select("id, title, source, url, published_at, detected_book, detected_author, project_type, project_status, confidence_score, opportunity_id, created_at", { count: "exact" })
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (source)       q = q.eq("source", source)
  if (project_type) q = q.eq("project_type", project_type)
  if (min_score > 0) q = q.gte("confidence_score", min_score)
  if (only_adapt)   q = q.gte("confidence_score", 50)

  const { data, error, count } = await q

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0 })
}
