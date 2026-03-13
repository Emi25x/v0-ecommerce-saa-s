import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("carriers")
    .select("id, name, slug, description, active, config, created_at")
    .eq("slug", params.slug)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createAdminClient()
  const body = await req.json()

  const update: Record<string, any> = {}

  if (typeof body.active === "boolean") update.active = body.active
  if (body.config) update.config = body.config

  // Credenciales: se guardan en columna separada, sólo si se envían
  const hasCredentials =
    body.credentials_user ||
    body.credentials_password ||
    body.credentials_token ||
    body.credentials_uuid ||
    body.credentials_secret

  if (hasCredentials) {
    // Fetch existing credentials first
    const { data: existing } = await supabase
      .from("carriers")
      .select("credentials")
      .eq("slug", params.slug)
      .maybeSingle()

    const creds = (existing as any)?.credentials ?? {}
    if (body.credentials_user)     creds.user     = body.credentials_user
    if (body.credentials_password) creds.password  = body.credentials_password
    if (body.credentials_token)    creds.token     = body.credentials_token
    if (body.credentials_uuid)     creds.uuid      = body.credentials_uuid
    if (body.credentials_secret)   creds.secret    = body.credentials_secret
    update.credentials = creds
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const { error } = await supabase
    .from("carriers")
    .update(update)
    .eq("slug", params.slug)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
