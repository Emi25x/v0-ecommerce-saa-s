import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createFastMailClient, FastMailConfig, FastMailCredentials } from "@/lib/carriers/fastmail"

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

  const creds = (carrier as any).credentials as FastMailCredentials | null
  if (!creds?.user || !creds?.password) {
    return NextResponse.json({
      ok: false,
      message: "Credenciales no configuradas. Guardá usuario y contraseña primero.",
    })
  }

  try {
    if (params.slug === "fastmail") {
      const client = createFastMailClient(
        (carrier as any).config as FastMailConfig,
        creds
      )
      // Intentar cotización mínima como health check
      const res = await client.quote({
        origen_cp:  "1000",
        destino_cp: "5000",
        peso_g:     300,
        valor:      1000,
      })
      if (res.error) throw new Error(res.error)
      return NextResponse.json({ ok: true, message: "Conexión exitosa con FastMail API v2" })
    }

    return NextResponse.json({ ok: false, message: `Test no implementado para "${params.slug}"` })
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err.message })
  }
}
