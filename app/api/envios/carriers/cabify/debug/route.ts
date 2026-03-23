import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { CabifyLogisticsClient, CabifyConfig, CabifyCredentials } from "@/domains/shipping/carriers/cabify"

/**
 * GET /api/envios/carriers/cabify/debug
 * Diagnóstico completo de la conexión con Cabify Logistics.
 * Muestra raw responses de la API para identificar problemas de configuración.
 *
 * Query params opcionales:
 *   lat, lon — coordenadas para probar shipping_types (default: CABA)
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const lat = parseFloat(url.searchParams.get("lat") ?? "-34.603722")
  const lon = parseFloat(url.searchParams.get("lon") ?? "-58.381592")

  const supabase = createAdminClient()
  const { data: carrier, error } = await supabase
    .from("carriers")
    .select("slug, config, credentials, active")
    .eq("slug", "cabify")
    .maybeSingle()

  if (error || !carrier) {
    return NextResponse.json({ ok: false, message: "Carrier 'cabify' no encontrado en DB" }, { status: 404 })
  }

  const creds = (carrier as any).credentials as CabifyCredentials | null
  if (!creds?.client_id || !creds?.client_secret) {
    return NextResponse.json({ ok: false, message: "Credenciales incompletas en DB" })
  }

  const config = (carrier as any).config as CabifyConfig
  const client = new CabifyLogisticsClient(config ?? {}, creds)

  const results: Record<string, unknown> = {
    carrier_active: (carrier as any).active,
    config_base_url: config?.base_url ?? "(default: https://logistics.api.cabify.com)",
    config_auth_url: config?.auth_url ?? "(default: https://cabify.com/auth/api/authorization)",
    query_location: { lat, lon },
  }

  // 1. Test OAuth token
  try {
    const token = await (client as any).getBearerToken()
    results.oauth = { ok: true, token_preview: token?.substring(0, 20) + "..." }
  } catch (err: any) {
    results.oauth = { ok: false, error: err.message }
    return NextResponse.json(results)
  }

  // 2. Raw shipping_types response
  try {
    const raw = await client.getShippingTypesRaw(lat, lon)
    results.shipping_types_raw = raw
  } catch (err: any) {
    results.shipping_types_raw = { error: err.message }
  }

  // 3. Parsed shipping_types
  try {
    const types = await client.getShippingTypes(lat, lon)
    results.shipping_types_parsed = { count: types.length, types }
  } catch (err: any) {
    results.shipping_types_parsed = { error: err.message }
  }

  // 4. Try different locations (CABA, GBA, Córdoba)
  const locations = [
    { name: "CABA Centro", lat: -34.603722, lon: -58.381592 },
    { name: "GBA Avellaneda", lat: -34.6623, lon: -58.3656 },
    { name: "Córdoba Centro", lat: -31.4201, lon: -64.1888 },
    { name: "Palermo", lat: -34.5795, lon: -58.4222 },
  ]
  const locationResults: Record<string, unknown> = {}
  for (const loc of locations) {
    if (Math.abs(loc.lat - lat) < 0.001 && Math.abs(loc.lon - lon) < 0.001) continue
    try {
      const types = await client.getShippingTypes(loc.lat, loc.lon)
      locationResults[loc.name] = { count: types.length, types: types.map((t) => t.name) }
    } catch (err: any) {
      locationResults[loc.name] = { error: err.message }
    }
  }
  results.other_locations = locationResults

  // 5. Hubs
  try {
    const hubs = await client.listHubs()
    results.hubs = hubs
  } catch (err: any) {
    results.hubs = { error: err.message }
  }

  // 6. Users
  try {
    const users = await client.listUsers()
    results.users = users
  } catch (err: any) {
    results.users = { error: err.message }
  }

  // 7. Webhooks
  try {
    const webhooks = await client.listWebhooks()
    results.webhooks = webhooks
  } catch (err: any) {
    results.webhooks = { error: err.message }
  }

  // 8. Coverage check for CABA
  try {
    const inZone = await client.checkPickupArea({ address: "Av. Corrientes 1234, Buenos Aires" })
    results.coverage_check = { address: "Av. Corrientes 1234, Buenos Aires", in_zone: inZone }
  } catch (err: any) {
    results.coverage_check = { error: err.message }
  }

  return NextResponse.json(results, { status: 200 })
}
