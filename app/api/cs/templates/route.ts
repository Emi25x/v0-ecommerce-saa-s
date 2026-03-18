import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

/**
 * GET /api/cs/templates
 * Returns response templates for the current user.
 * Query params: category, q (search in name/body)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const category = searchParams.get("category") || undefined
  const q        = searchParams.get("q") || undefined

  let query = supabase
    .from("cs_response_templates")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("use_count", { ascending: false })

  if (category) query = query.eq("category", category)
  if (q) query = query.or(`name.ilike.%${q}%,body.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ templates: data ?? [] })
}

/**
 * POST /api/cs/templates
 * Create a new response template.
 * Body: { name, category, channels, subject, body }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.name || !body?.body) {
    return NextResponse.json({ error: "name and body are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("cs_response_templates")
    .insert({
      user_id: user.id,
      name: body.name,
      category: body.category ?? null,
      channels: body.channels ?? [],
      subject: body.subject ?? null,
      body: body.body,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

/**
 * PATCH /api/cs/templates/[id] would go in [id]/route.ts
 * DELETE /api/cs/templates/[id] would go in [id]/route.ts
 */
