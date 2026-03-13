import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createFastMailClient, FastMailConfig, FastMailCredentials } from "@/lib/carriers/fastmail"
import { createCabifyClient, CabifyConfig, CabifyCredentials } from "@/lib/carriers/cabify"

export async function POST(_req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createAdminClient()
  const { data: carrier, error } = await supabase
    .from("carriers")
    .select("slug, config, credentials, active")
    .eq("slug", params.slug)
    .maybeSingle()

  if (error || !carrier) {
    return NextResponse.json({ ok: false, message: "Transportista no encontrado" }, { status: 404 })
  }

  const creds = (carrier as any).credentials as Record<string, string> | null

  try {
    if (params.slug === "fastmail") {
      if (!creds?.token && (!creds?.user || !creds?.password)) {
        return NextResponse.json({
          ok: false,
          message: "Credenciales no configuradas. Guardá el Token API (o usuario y contraseña) primero.",
        })
      }
      const client = createFastMailClient(
        (carrier as any).config as FastMailConfig,
        creds as FastMailCredentials
      )
      const res = await client.quote({
        origen_cp:  "1000",
        destino_cp: "5000",
        peso_g:     300,
        valor:      1000,
      })
      if (res.error) throw new Error(res.error)
      return NextResponse.json({ ok: true, message: "Conexión exitosa con FastMail API v2" })
    }

    if (params.slug === "cabify") {
      if (!creds?.uuid || !creds?.secret) {
        return NextResponse.json({
          ok: false,
          message: "Credenciales incompletas. Guardá el UUID y el Secreto de Cabify Logistics primero.",
        })
      }
      const client = createCabifyClient(
        (carrier as any).config as CabifyConfig,
        creds as CabifyCredentials
      )
      // Cotización mínima como health check
      const res = await client.quote({
        pickup_postal_code:   "1000",
        delivery_postal_code: "5000",
        weight_g:             300,
        declared_value:       1000,
      })
      if (res.error) throw new Error(res.error)
      return NextResponse.json({ ok: true, message: `Conexión exitosa con Cabify Logistics — ${res.services?.length ?? 0} servicios disponibles` })
    }

    return NextResponse.json({ ok: false, message: `Test no implementado para "${params.slug}"` })
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err.message })
  }
}
