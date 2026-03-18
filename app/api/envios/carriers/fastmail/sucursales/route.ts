/**
 * GET /api/envios/carriers/fastmail/sucursales
 *
 * Devuelve las sucursales del cliente en FastMail.
 * Llama a POST /api/v2/sucursalesByCliente.json y normaliza la respuesta.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createFastMailClient, type FastMailConfig, type FastMailCredentials } from "@/domains/shipping/carriers/fastmail"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = createAdminClient()
  const { data: carrier } = await supabase
    .from("carriers")
    .select("config, credentials, active")
    .eq("slug", "fastmail")
    .maybeSingle()

  if (!carrier?.active) {
    return NextResponse.json({ error: "FastMail no configurado o inactivo" }, { status: 404 })
  }

  try {
    const client = createFastMailClient(
      carrier.config as FastMailConfig,
      carrier.credentials as FastMailCredentials,
    )

    const sucursales = await client.getSucursales()
    return NextResponse.json({ sucursales })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
