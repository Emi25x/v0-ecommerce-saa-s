/**
 * @internal Development-only diagnostic endpoint.
 * Used by: app/(dashboard)/envios/cotizador/page.tsx
 *
 * GET /api/envios/carriers/fastmail-debug?origen_cp=XXX&destino_cp=YYY&peso_g=NNN
 *
 * Endpoint de diagnóstico: cotiza TODOS los servicios disponibles usando ambos
 * métodos (precio-servicio.json y cotizador.json) y compara los resultados.
 *
 * Fuentes de servicios consultadas:
 *   1. servicios-cliente.json  → servicios habilitados para el cliente
 *   2. serviciosByCp           → servicios disponibles para el CP destino (v1)
 *
 * Cotizadores usados:
 *   A. precio-servicio.json    → un solo llamado, devuelve todos los servicios del tramo
 *   B. cotizador.json          → un llamado por servicio en paralelo
 */
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import {
  createFastMailClient,
  type FastMailConfig,
  type FastMailCredentials,
  type FastMailProducto,
} from "@/domains/shipping/carriers/fastmail"

export const dynamic = "force-dynamic"

const toVal = (r: PromiseSettledResult<any>) =>
  r.status === "fulfilled" ? r.value : { ERROR: r.reason?.message ?? String(r.reason) }

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const origen_cp = searchParams.get("origen_cp") ?? "1000"
  const destino_cp = searchParams.get("destino_cp") ?? "1900"
  const peso_g = parseInt(searchParams.get("peso_g") ?? "1000")

  const supabase = createAdminClient()
  const { data: carrier } = await supabase
    .from("carriers")
    .select("config, credentials, active")
    .eq("slug", "fastmail")
    .maybeSingle()

  if (!carrier?.active) {
    return NextResponse.json({ error: "FastMail no configurado o inactivo" }, { status: 404 })
  }

  const client = createFastMailClient(carrier.config as FastMailConfig, carrier.credentials as FastMailCredentials)

  const productos: FastMailProducto[] = [
    {
      bultos: 1,
      peso: peso_g / 1000,
      descripcion: "Paquete",
      dimensiones: { alto: 10, largo: 20, profundidad: 15 },
    },
  ]

  const config = carrier.config as any
  const sucursal = config?.sucursal ?? ""

  // ── 1. Obtener lista de servicios de ambas fuentes en paralelo ──────────────
  const [rawServiciosCliente, rawServiciosByCp] = await Promise.allSettled([
    client.serviciosCliente(),
    sucursal ? client.serviciosByCp(destino_cp) : Promise.resolve(null),
  ])

  // Normalizar lista de serviciosCliente
  const listaCliente: Array<{ codigo: string; nombre: string; cotiza: string }> = (() => {
    const raw = toVal(rawServiciosCliente)
    const arr: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.servicios)
        ? raw.servicios
        : Array.isArray(raw?.message)
          ? raw.message
          : Array.isArray(raw?.data)
            ? raw.data
            : []
    return arr.map((s) => ({
      codigo: String(s.codigo_servicio ?? s.codigo ?? ""),
      nombre: String(s.descripcion ?? s.detalle_servicio ?? s.codigo_servicio ?? ""),
      cotiza: String(s.cotiza ?? "?"),
    }))
  })()

  // Normalizar lista de serviciosByCp
  const listaByCp: Array<{ codigo: string; nombre: string }> = (() => {
    const raw = toVal(rawServiciosByCp)
    if (!raw || raw === null || !Array.isArray(raw)) return []
    return raw.map((s: any) => ({
      codigo: String(s.cod_serv ?? s.codigo_servicio ?? s.codigo ?? ""),
      nombre: String(s.descripcion ?? s.cod_serv ?? ""),
    }))
  })()

  // ── 2. Cotizador A: precio-servicio.json (un solo llamado) ──────────────────
  const precioServicioResult = sucursal
    ? await (client as any)
        .precioServicio({ cp_destino: destino_cp, sucursal, productos })
        .then((r: any) => ({ ok: true, raw: r }))
        .catch((e: any) => ({ ok: false, error: e.message }))
    : { ok: false, error: "SKIPPED (sucursal no configurada)" }

  // ── 3. Cotizador B: cotizador.json por cada servicio en paralelo ────────────
  // Unir candidatos de ambas fuentes (deduplicar por código)
  const codigosVistos = new Set<string>()
  const candidatosCotizador: Array<{ codigo: string; nombre: string; fuente: string }> = []

  for (const s of listaCliente) {
    if (s.codigo && !codigosVistos.has(s.codigo)) {
      codigosVistos.add(s.codigo)
      candidatosCotizador.push({ ...s, fuente: "servicios-cliente" })
    }
  }
  for (const s of listaByCp) {
    if (s.codigo && !codigosVistos.has(s.codigo)) {
      codigosVistos.add(s.codigo)
      candidatosCotizador.push({ ...s, fuente: "servicios-by-cp" })
    }
  }

  const cotizadorResults = await Promise.allSettled(
    candidatosCotizador.map(async ({ codigo, nombre, fuente }) => {
      const raw = await (client as any).cotizador({
        cp_origen: origen_cp,
        cp_destino: destino_cp,
        sucursal: sucursal || undefined,
        codigo_servicio: codigo,
        productos,
      })
      return { codigo, nombre, fuente, raw }
    }),
  )

  const cotizadorPorServicio = cotizadorResults.map((r, i) => {
    const candidato = candidatosCotizador[i]
    if (r.status === "rejected") {
      return { ...candidato, resultado: null, error: r.reason?.message ?? String(r.reason) }
    }
    return { ...candidato, resultado: r.value.raw, error: null }
  })

  return NextResponse.json({
    config: {
      sucursal,
      servicio_default: config?.servicio_default ?? "",
    },
    params: { origen_cp, destino_cp, peso_g },

    // Fuentes de servicios
    fuentes: {
      servicios_cliente: {
        total: listaCliente.length,
        lista: listaCliente,
        raw: toVal(rawServiciosCliente),
      },
      servicios_by_cp: {
        total: listaByCp.length,
        lista: listaByCp,
        raw: toVal(rawServiciosByCp),
      },
    },

    // Cotizador A: precio-servicio.json
    cotizador_a_precio_servicio: precioServicioResult,

    // Cotizador B: cotizador.json por servicio
    cotizador_b_por_servicio: {
      total_candidatos: candidatosCotizador.length,
      resultados: cotizadorPorServicio,
    },
  })
}
