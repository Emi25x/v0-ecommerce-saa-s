"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, Truck, Package } from "lucide-react"

// ── Tipos ───────────────────────────────────────────────────────────────────

interface ServicioRow {
  carrier: string
  fuente: string
  codigo: string
  nombre: string
  precio: number | null
  plazo: string | null
  raw: unknown
}

interface FastMailDebugResponse {
  config: { sucursal: string; servicio_default: string }
  params: { origen_cp: string; destino_cp: string; peso_g: number }
  fuentes: {
    servicios_cliente: { total: number; lista: Array<{ codigo: string; nombre: string; cotiza: string }> }
    servicios_by_cp:   { total: number; lista: Array<{ codigo: string; nombre: string }> }
  }
  cotizador_a_precio_servicio: {
    ok: boolean
    raw?: unknown
    error?: string
  }
  cotizador_b_por_servicio: {
    total_candidatos: number
    resultados: Array<{
      codigo: string
      nombre: string
      fuente: string
      resultado: unknown
      error: string | null
    }>
  }
}

// ── Helpers para extraer precio ──────────────────────────────────────────────

function extraerPrecioFastmail(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  // Formato cotizador.json: { importe_total_flete, total_flete, precio, importe }
  for (const key of ["importe_total_flete", "total_flete", "precio", "importe", "total"]) {
    const v = r[key]
    if (typeof v === "number" && v > 0) return v
    if (typeof v === "string" && parseFloat(v) > 0) return parseFloat(v)
  }

  // Formato precio-servicio.json: { precio: { importe_total_flete } }
  if (r.precio && typeof r.precio === "object") {
    const p = r.precio as Record<string, unknown>
    for (const key of ["importe_total_flete", "total_flete", "importe", "total"]) {
      const v = p[key]
      if (typeof v === "number" && v > 0) return v
      if (typeof v === "string" && parseFloat(v) > 0) return parseFloat(v)
    }
  }

  // Formato lista: array de servicios
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const p = extraerPrecioFastmail(item)
      if (p !== null) return p
    }
  }

  return null
}

function extraerPlazoFastmail(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  for (const key of ["plazo_entrega", "plazo", "dias_entrega", "dias"]) {
    const v = r[key]
    if (v !== undefined && v !== null && v !== "") return String(v) + (typeof v === "number" ? " días" : "")
  }
  if (r.precio && typeof r.precio === "object") {
    const p = r.precio as Record<string, unknown>
    for (const key of ["plazo_entrega", "plazo", "dias_entrega", "dias"]) {
      const v = p[key]
      if (v !== undefined && v !== null && v !== "") return String(v)
    }
  }
  return null
}

function parseFastmailDebug(data: FastMailDebugResponse): ServicioRow[] {
  const rows: ServicioRow[] = []
  const vistosA = new Set<string>()

  // Cotizador A: precio-servicio.json
  if (data.cotizador_a_precio_servicio?.ok && data.cotizador_a_precio_servicio.raw) {
    const raw = data.cotizador_a_precio_servicio.raw
    const lista = Array.isArray(raw) ? raw : [raw]
    for (const item of lista) {
      if (!item || typeof item !== "object") continue
      const r = item as Record<string, unknown>
      // { servicio: { cod_serv, alias }, precio: { importe_total_flete } }
      const servicio = r.servicio as Record<string, unknown> | undefined
      const codigo = String(servicio?.cod_serv ?? servicio?.codigo ?? r.cod_serv ?? r.codigo ?? "?")
      const nombre = String(servicio?.alias ?? servicio?.descripcion ?? r.alias ?? r.descripcion ?? codigo)
      const precio = extraerPrecioFastmail(item)
      const plazo  = extraerPlazoFastmail(item)
      rows.push({ carrier: "FastMail", fuente: "A · precio-servicio", codigo, nombre, precio, plazo, raw: item })
      vistosA.add(codigo)
    }
  }

  // Cotizador B: cotizador.json por servicio
  for (const res of data.cotizador_b_por_servicio?.resultados ?? []) {
    const precio = res.resultado ? extraerPrecioFastmail(res.resultado) : null
    const plazo  = res.resultado ? extraerPlazoFastmail(res.resultado) : null
    rows.push({
      carrier: "FastMail",
      fuente:  "B · cotizador",
      codigo:  res.codigo,
      nombre:  res.nombre,
      precio,
      plazo,
      raw: res.error ?? res.resultado,
    })
  }

  return rows
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function CotizadorPage() {
  const [form, setForm] = useState({
    origen_cp:   "",
    destino_cp:  "",
    peso_g:      "1000",
    alto:        "10",
    largo:       "20",
    profundidad: "15",
  })

  const [loading,   setLoading]   = useState(false)
  const [rows,      setRows]      = useState<ServicioRow[] | null>(null)
  const [debugFm,   setDebugFm]   = useState<FastMailDebugResponse | null>(null)
  const [errors,    setErrors]    = useState<string[]>([])

  function field(key: keyof typeof form) {
    return {
      value:    form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value })),
    }
  }

  async function cotizar() {
    if (!form.origen_cp || !form.destino_cp || !form.peso_g) return
    setLoading(true)
    setRows(null)
    setDebugFm(null)
    setErrors([])

    const errs: string[] = []
    const allRows: ServicioRow[] = []

    // ── FastMail debug (ambos cotizadores en un solo endpoint) ──────────────
    try {
      const qs = new URLSearchParams({
        origen_cp:  form.origen_cp,
        destino_cp: form.destino_cp,
        peso_g:     form.peso_g,
      })
      const res = await fetch(`/api/envios/carriers/fastmail-debug?${qs}`)
      if (res.ok) {
        const data: FastMailDebugResponse = await res.json()
        setDebugFm(data)
        allRows.push(...parseFastmailDebug(data))
      } else {
        const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        errs.push(`FastMail: ${error}`)
      }
    } catch (e: unknown) {
      errs.push(`FastMail: ${e instanceof Error ? e.message : String(e)}`)
    }

    // ── Cabify quote ────────────────────────────────────────────────────────
    try {
      const res = await fetch("/api/envios/quote", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          carrier_slug: "cabify",
          origen_cp:    form.origen_cp,
          destino_cp:   form.destino_cp,
          peso_g:       parseInt(form.peso_g),
          dimensiones: {
            alto:        parseInt(form.alto),
            largo:       parseInt(form.largo),
            profundidad: parseInt(form.profundidad),
          },
        }),
      })
      const data = await res.json()
      if (data.ok && Array.isArray(data.servicios)) {
        for (const s of data.servicios) {
          allRows.push({
            carrier: "Cabify",
            fuente:  "quote",
            codigo:  s.codigo ?? "",
            nombre:  s.nombre ?? s.codigo ?? "",
            precio:  s.precio ?? null,
            plazo:   s.plazo_dias != null ? `${s.plazo_dias} días` : null,
            raw:     s,
          })
        }
      } else {
        errs.push(`Cabify: ${data.error ?? "sin servicios"}`)
      }
    } catch (e: unknown) {
      errs.push(`Cabify: ${e instanceof Error ? e.message : String(e)}`)
    }

    setRows(allRows)
    setErrors(errs)
    setLoading(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const fmA = rows?.filter(r => r.fuente.startsWith("A"))   ?? []
  const fmB = rows?.filter(r => r.fuente.startsWith("B"))   ?? []
  const cab = rows?.filter(r => r.carrier === "Cabify")     ?? []

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cotizador de envíos</h1>
          <p className="text-sm text-muted-foreground">
            Consultá precios de FastMail (ambos cotizadores) y Cabify en paralelo
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/envios">← Volver a Envíos</Link>
        </Button>
      </div>

      {/* Formulario */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parámetros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="col-span-1">
              <Label>CP Origen</Label>
              <Input placeholder="1000" {...field("origen_cp")} />
            </div>
            <div className="col-span-1">
              <Label>CP Destino</Label>
              <Input placeholder="7600" {...field("destino_cp")} />
            </div>
            <div className="col-span-1">
              <Label>Peso (g)</Label>
              <Input type="number" placeholder="1000" {...field("peso_g")} />
            </div>
            <div className="col-span-1">
              <Label>Alto (cm)</Label>
              <Input type="number" placeholder="10" {...field("alto")} />
            </div>
            <div className="col-span-1">
              <Label>Largo (cm)</Label>
              <Input type="number" placeholder="20" {...field("largo")} />
            </div>
            <div className="col-span-1">
              <Label>Prof. (cm)</Label>
              <Input type="number" placeholder="15" {...field("profundidad")} />
            </div>
          </div>

          <Button
            className="mt-4 gap-2"
            onClick={cotizar}
            disabled={loading || !form.origen_cp || !form.destino_cp}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Cotizar
          </Button>
        </CardContent>
      </Card>

      {/* Errores */}
      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive space-y-1">
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      {/* Resultados FastMail */}
      {rows !== null && (
        <>
          {/* FastMail Cotizador A */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4" />
                FastMail — Cotizador A (precio-servicio)
                <Badge variant="secondary" className="ml-auto">{fmA.length} servicio{fmA.length !== 1 ? "s" : ""}</Badge>
              </CardTitle>
              {debugFm?.config && (
                <p className="text-xs text-muted-foreground">
                  Sucursal: <strong>{debugFm.config.sucursal || "—"}</strong>
                </p>
              )}
            </CardHeader>
            <CardContent>
              {fmA.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Sin resultados.{" "}
                  {debugFm?.cotizador_a_precio_servicio?.error && (
                    <span className="text-destructive">{debugFm.cotizador_a_precio_servicio.error}</span>
                  )}
                </p>
              ) : (
                <ServiceTable rows={fmA} />
              )}
            </CardContent>
          </Card>

          {/* FastMail Cotizador B */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4" />
                FastMail — Cotizador B (por servicio)
                <Badge variant="secondary" className="ml-auto">{fmB.length} servicio{fmB.length !== 1 ? "s" : ""}</Badge>
              </CardTitle>
              {debugFm && (
                <p className="text-xs text-muted-foreground">
                  Servicios-cliente: {debugFm.fuentes.servicios_cliente.total} ·
                  Servicios-by-cp: {debugFm.fuentes.servicios_by_cp.total} ·
                  Candidatos cotizados: {debugFm.cotizador_b_por_servicio.total_candidatos}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {fmB.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Sin candidatos para cotizar.</p>
              ) : (
                <ServiceTable rows={fmB} />
              )}
            </CardContent>
          </Card>

          {/* Cabify */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" />
                Cabify Logistics
                <Badge variant="secondary" className="ml-auto">{cab.length} servicio{cab.length !== 1 ? "s" : ""}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cab.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Sin servicios disponibles (verificá que la cuenta Cabify tenga servicios activados).
                </p>
              ) : (
                <ServiceTable rows={cab} />
              )}
            </CardContent>
          </Card>

          {/* Lista completa de servicios disponibles */}
          {debugFm && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Servicios disponibles FastMail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-semibold mb-1">servicios-cliente ({debugFm.fuentes.servicios_cliente.total})</p>
                  <div className="flex flex-wrap gap-1">
                    {debugFm.fuentes.servicios_cliente.lista.map(s => (
                      <Badge key={s.codigo} variant="outline" className="text-xs font-mono">
                        {s.codigo} · {s.nombre}
                      </Badge>
                    ))}
                    {debugFm.fuentes.servicios_cliente.lista.length === 0 && (
                      <span className="text-xs text-muted-foreground">ninguno</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-1">servicios-by-cp para {debugFm.params.destino_cp} ({debugFm.fuentes.servicios_by_cp.total})</p>
                  <div className="flex flex-wrap gap-1">
                    {debugFm.fuentes.servicios_by_cp.lista.map(s => (
                      <Badge key={s.codigo} variant="outline" className="text-xs font-mono">
                        {s.codigo} · {s.nombre}
                      </Badge>
                    ))}
                    {debugFm.fuentes.servicios_by_cp.lista.length === 0 && (
                      <span className="text-xs text-muted-foreground">ninguno</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ── Tabla de servicios ───────────────────────────────────────────────────────

function ServiceTable({ rows }: { rows: ServicioRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-xs">Código</th>
            <th className="px-3 py-2 text-left font-medium text-xs">Servicio</th>
            <th className="px-3 py-2 text-right font-medium text-xs">Precio</th>
            <th className="px-3 py-2 text-right font-medium text-xs">Plazo</th>
            <th className="px-3 py-2 text-center font-medium text-xs">Raw</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const key = `${row.fuente}-${row.codigo}-${i}`
            const isOpen = expanded === key
            return (
              <>
                <tr key={key} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="px-3 py-2 font-mono text-xs">{row.codigo || "—"}</td>
                  <td className="px-3 py-2">{row.nombre || "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {row.precio != null
                      ? `$${row.precio.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground text-xs">
                    {row.plazo ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      className="text-xs text-blue-500 hover:underline"
                      onClick={() => setExpanded(isOpen ? null : key)}
                    >
                      {isOpen ? "cerrar" : "ver"}
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr key={key + "-raw"} className="bg-muted/40">
                    <td colSpan={5} className="px-3 py-2">
                      <pre className="text-xs overflow-auto max-h-48 whitespace-pre-wrap break-all">
                        {JSON.stringify(row.raw, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
