import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"
import { buildFacturaHTML } from "@/domains/billing/arca/pdf"
import { buildFacturaHtmlParams } from "@/domains/billing/factura-builder"

function buildPDFResponse(factura: any) {
  const config = factura.arca_config as any

  if (!config) {
    return NextResponse.json({ error: "Configuración ARCA no encontrada para esta factura" }, { status: 404 })
  }

  const html = buildFacturaHTML(buildFacturaHtmlParams(factura, config))

  return new Response(html, {
    headers: {
      "Content-Type":        "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="factura-${String(factura.punto_venta).padStart(4, "0")}-${String(factura.numero).padStart(8, "0")}.html"`,
    },
  })
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // 1. Buscar la factura
    const { data: factura, error: facturaError } = await supabase
      .from("facturas")
      .select("*")
      .eq("id", params.id)
      .maybeSingle()

    if (facturaError || !factura) {
      console.log("[v0] PDF - Factura not found, id:", params.id, "error:", facturaError?.message)
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    // 2. Buscar arca_config y verificar autorización en una sola query
    const configId = factura.arca_config_id || factura.empresa_id
    if (!configId) {
      return NextResponse.json({ error: "Factura sin configuración ARCA asociada" }, { status: 404 })
    }

    const { data: config, error: configError } = await supabase
      .from("arca_config")
      .select("*")
      .eq("id", configId)
      .single()

    if (configError || !config) {
      return NextResponse.json({ error: "Configuración ARCA no encontrada" }, { status: 404 })
    }

    // Autorización: user_id de la config debe coincidir (cubre también facturas con user_id nulo)
    if (config.user_id !== user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    return buildPDFResponse({ ...factura, arca_config: config })
  } catch (e: any) {
    console.log("[v0] PDF - Unexpected error:", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
