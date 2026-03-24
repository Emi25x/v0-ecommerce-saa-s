import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { CabifyLogisticsClient, CabifyConfig, CabifyCredentials } from "@/domains/shipping/carriers/cabify"

/**
 * GET /api/envios/carriers/cabify/hubs
 * Lista los hubs configurados en Cabify Logistics.
 */
export async function GET() {
  const supabase = createAdminClient()
  const { data: carrier, error } = await supabase
    .from("carriers")
    .select("config, credentials")
    .eq("slug", "cabify")
    .maybeSingle()

  if (error || !carrier) {
    return NextResponse.json({ error: "Carrier 'cabify' no encontrado" }, { status: 404 })
  }

  const creds = carrier.credentials as CabifyCredentials | null
  if (!creds?.client_id || !creds?.client_secret) {
    return NextResponse.json({ error: "Credenciales Cabify no configuradas" }, { status: 400 })
  }

  const config = carrier.config as CabifyConfig
  const client = new CabifyLogisticsClient(config ?? {}, creds)

  try {
    const result = await client.listHubs()
    const hubs = result?.client_hubs ?? []
    return NextResponse.json({ ok: true, hubs })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
