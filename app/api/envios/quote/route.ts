import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createFastMailClient } from "@/lib/carriers/fastmail"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { origen_cp, destino_cp, peso_g, valor, dimensiones } = body

    if (!origen_cp || !destino_cp || !peso_g) {
      return NextResponse.json(
        { error: "origen_cp, destino_cp y peso_g son requeridos" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const { data: carrier } = await supabase
      .from("carriers")
      .select("*")
      .eq("slug", "fastmail")
      .single()

    if (!carrier?.active) {
      return NextResponse.json({ error: "FastMail no configurado" }, { status: 503 })
    }

    const client = createFastMailClient(carrier.config, carrier.credentials)
    const quote = await client.quote({ origen_cp, destino_cp, peso_g, valor: valor ?? 0, dimensiones })

    if (quote.error) {
      return NextResponse.json({ error: quote.error }, { status: 502 })
    }

    return NextResponse.json({ ok: true, servicios: quote.servicios })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
