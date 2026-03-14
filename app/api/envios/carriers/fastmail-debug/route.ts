/**
 * GET /api/envios/carriers/fastmail-debug?origen_cp=XXX&destino_cp=YYY&peso_g=NNN
 *
 * Endpoint de diagnóstico: llama a los endpoints de cotización de FastMail
 * y devuelve las respuestas RAW para entender el formato real de la API.
 */
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createFastMailClient, type FastMailConfig, type FastMailCredentials, type FastMailProducto } from "@/lib/carriers/fastmail"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const origen_cp  = searchParams.get("origen_cp")  ?? "1000"
  const destino_cp = searchParams.get("destino_cp") ?? "1900"
  const peso_g     = parseInt(searchParams.get("peso_g") ?? "1000")

  const supabase = createAdminClient()
  const { data: carrier } = await supabase
    .from("carriers")
    .select("config, credentials, active")
    .eq("slug", "fastmail")
    .maybeSingle()

  if (!carrier?.active) {
    return NextResponse.json({ error: "FastMail no configurado o inactivo" }, { status: 404 })
  }

  const client = createFastMailClient(
    carrier.config as FastMailConfig,
    carrier.credentials as FastMailCredentials,
  )

  const productos: FastMailProducto[] = [{
    bultos:      1,
    peso:        peso_g / 1000,
    descripcion: "Paquete",
    dimensiones: { alto: 10, largo: 20, profundidad: 15 },
  }]

  const config = carrier.config as any
  const sucursal = config?.sucursal ?? ""

  // Llamar a todos los endpoints relevantes y devolver respuestas raw
  const [
    serviciosCliente,
    serviciosByCp,
    precioServicio,
    cotizadorRaw,
  ] = await Promise.allSettled([
    client.serviciosCliente(),
    client.serviciosByCp(destino_cp),
    sucursal
      ? (client as any).precioServicio({ cp_destino: destino_cp, sucursal, productos })
      : Promise.resolve("SKIPPED (sucursal no configurada)"),
    // Cotizar con el primer servicio que tenga cotiza=SI
    (async () => {
      const svcs = await client.serviciosCliente().catch(() => [])
      const first = Array.isArray(svcs)
        ? svcs.find((s: any) => s.cotiza === "SI") ?? svcs[0]
        : null
      if (!first) return "NO SERVICES FOUND"
      return (client as any).cotizador({
        cp_origen:       origen_cp,
        cp_destino:      destino_cp,
        sucursal:        sucursal || undefined,
        codigo_servicio: first.codigo_servicio,
        productos,
      })
    })(),
  ])

  const toVal = (r: PromiseSettledResult<any>) =>
    r.status === "fulfilled" ? r.value : { ERROR: r.reason?.message ?? String(r.reason) }

  return NextResponse.json({
    config: {
      sucursal,
      servicio_default: config?.servicio_default ?? "",
    },
    params: { origen_cp, destino_cp, peso_g },
    raw: {
      servicios_cliente:  toVal(serviciosCliente),
      servicios_by_cp:    toVal(serviciosByCp),
      precio_servicio:    toVal(precioServicio),
      cotizador_muestra:  toVal(cotizadorRaw),
    },
  })
}
