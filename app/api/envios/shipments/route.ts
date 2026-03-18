import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20"), 200)
  const offset = parseInt(searchParams.get("offset") ?? "0")
  const status = searchParams.get("status")
  const carrier = searchParams.get("carrier")

  const supabase = createAdminClient()
  let q = supabase
    .from("shipments")
    .select("id, carrier_slug, tracking_number, status, destination, created_at, updated_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status)  q = (q as any).eq("status", status)
  if (carrier) q = (q as any).eq("carrier_slug", carrier)

  const { data, error, count } = await (q as any)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("shipments")
    .insert({
      carrier_id:      body.carrier_id ?? null,
      carrier_slug:    body.carrier_slug,
      external_id:     body.external_id ?? null,
      tracking_number: body.tracking_number ?? null,
      status:          body.status ?? "pending",
      origin:          body.origin ?? null,
      destination:     body.destination ?? null,
      items:           body.items ?? null,
      weight_g:        body.weight_g ?? null,
      dimensions:      body.dimensions ?? null,
      declared_value:  body.declared_value ?? null,
      cost:            body.cost ?? null,
      label_url:       body.label_url ?? null,
      tracking_url:    body.tracking_url ?? null,
      metadata:        body.metadata ?? {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
