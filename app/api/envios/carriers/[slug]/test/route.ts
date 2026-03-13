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
      if (!creds?.token) {
        return NextResponse.json({
          ok: false,
          message: "Credenciales no configuradas. Guardá el Token API en Transportistas → Fast Mail primero.",
        })
      }
      const client = createFastMailClient(
        (carrier as any).config as FastMailConfig,
        creds as FastMailCredentials
      )
      const res = await client.healthCheck()
      return NextResponse.json(res)
    }

    if (params.slug === "cabify") {
      if (!creds?.client_id || !creds?.client_secret) {
        return NextResponse.json({
          ok: false,
          message: "Credenciales incompletas. Guardá el Client ID y el Client Secret de Cabify Logistics primero.",
        })
      }
      const client = createCabifyClient(
        (carrier as any).config as CabifyConfig,
        creds as unknown as CabifyCredentials
      )
      const res = await client.healthCheck()
      return NextResponse.json(res)
    }

    return NextResponse.json({ ok: false, message: `Test no implementado para "${params.slug}"` })
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err.message })
  }
}
