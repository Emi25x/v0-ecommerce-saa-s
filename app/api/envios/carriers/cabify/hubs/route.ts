import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { CabifyLogisticsClient, CabifyConfig, CabifyCredentials } from "@/domains/shipping/carriers/cabify"

/**
 * GET /api/envios/carriers/cabify/hubs
 * Lista los hubs configurados en Cabify Logistics.
 * Intenta cargar desde la API; si falla, devuelve los hubs cacheados en config.
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
    // La API puede devolver: { client_hubs: [...] }, { hubs: [...] }, o un array directo
    let hubs: any[]
    if (Array.isArray(result)) {
      hubs = result
    } else if (result?.client_hubs) {
      hubs = result.client_hubs
    } else if (result?.hubs) {
      hubs = result.hubs
    } else if (result?.data) {
      hubs = Array.isArray(result.data) ? result.data : []
    } else {
      // Intentar extraer cualquier array del resultado
      const arrays = Object.values(result ?? {}).filter(Array.isArray)
      hubs = arrays.length > 0 ? (arrays[0] as any[]) : []
    }

    return NextResponse.json({
      ok: true,
      hubs,
      source: "api",
      raw_keys: result ? Object.keys(result) : [],
    })
  } catch (err: any) {
    // Fallback: devolver hubs cacheados en config si existen
    const cached = config?.hubs ?? []
    if (cached.length > 0) {
      return NextResponse.json({
        ok: true,
        hubs: cached,
        source: "cache",
        api_error: err.message,
      })
    }
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
