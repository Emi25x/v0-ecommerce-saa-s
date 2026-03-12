"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Calculator, Package, Truck, ExternalLink, CheckCircle } from "lucide-react"

interface QuoteService {
  codigo:     string
  nombre:     string
  plazo_dias: number
  precio:     number
}

export default function NuevoEnvioPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Pre-fill desde Shopify si viene con params
  const [remitente, setRemitente] = useState({
    nombre:    "",
    direccion: "",
    localidad: "",
    provincia: "",
    cp:        "",
    telefono:  "",
    email:     "",
  })
  const [destinatario, setDestinatario] = useState({
    nombre:    searchParams.get("dest_nombre")    ?? "",
    direccion: searchParams.get("dest_direccion") ?? "",
    localidad: searchParams.get("dest_localidad") ?? "",
    provincia: searchParams.get("dest_provincia") ?? "",
    cp:        searchParams.get("dest_cp")        ?? "",
    telefono:  searchParams.get("dest_telefono")  ?? "",
    email:     searchParams.get("dest_email")     ?? "",
  })
  const [pesoG, setPesoG]                   = useState(searchParams.get("peso_g") ?? "")
  const [valorDeclarado, setValorDeclarado] = useState(searchParams.get("valor")  ?? "")
  const [servicio, setServicio]             = useState("standard")
  const [referencia, setReferencia]         = useState(searchParams.get("ref")    ?? "")

  const [quoting, setQuoting]               = useState(false)
  const [quotes, setQuotes]                 = useState<QuoteService[] | null>(null)
  const [quoteError, setQuoteError]         = useState<string | null>(null)

  const [creating, setCreating]             = useState(false)
  const [result, setResult]                 = useState<any | null>(null)
  const [createError, setCreateError]       = useState<string | null>(null)

  async function getCotizacion() {
    if (!remitente.cp || !destinatario.cp || !pesoG) return
    setQuoting(true)
    setQuoteError(null)
    setQuotes(null)
    const res = await fetch("/api/envios/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origen_cp:  remitente.cp,
        destino_cp: destinatario.cp,
        peso_g:     parseInt(pesoG),
        valor:      parseFloat(valorDeclarado) || 0,
      }),
    })
    const data = await res.json()
    if (!res.ok) setQuoteError(data.error ?? "Error al cotizar")
    else setQuotes(data.servicios ?? [])
    setQuoting(false)
  }

  async function crearEnvio() {
    setCreating(true)
    setCreateError(null)
    const res = await fetch("/api/envios/create-shipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        carrier_slug: "fastmail",
        shipment: {
          remitente,
          destinatario,
          items: [],
          peso_total_g:    parseInt(pesoG) || 0,
          valor_declarado: parseFloat(valorDeclarado) || 0,
          servicio,
          referencia: referencia || undefined,
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setCreateError(data.error ?? "Error al crear envío")
    } else {
      setResult(data)
    }
    setCreating(false)
  }

  const camposOk =
    remitente.nombre && remitente.direccion && remitente.cp &&
    destinatario.nombre && destinatario.direccion && destinatario.cp &&
    pesoG && valorDeclarado

  if (result) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-xl">
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <CardTitle className="text-green-700">Envío creado</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Nro. guía</span>
              <span className="font-mono font-bold">{result.tracking_number ?? "—"}</span>
              <span className="text-muted-foreground">Estado</span>
              <Badge variant="secondary">{result.estado ?? "—"}</Badge>
              {result.costo && (
                <>
                  <span className="text-muted-foreground">Costo</span>
                  <span className="font-bold">${result.costo.toLocaleString("es-AR")}</span>
                </>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              {result.label_url && (
                <Button asChild size="sm">
                  <a href={result.label_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Descargar etiqueta
                  </a>
                </Button>
              )}
              {result.shipment_id && (
                <Button variant="outline" size="sm" onClick={() => router.push(`/envios/${result.shipment_id}`)}>
                  Ver seguimiento
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => router.push("/envios")}>
                Volver a Envíos
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/envios"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-2xl font-bold">Nuevo envío</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Remitente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Remitente (origen)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(["nombre", "direccion", "localidad", "provincia", "cp", "telefono", "email"] as const).map(f => (
              <div key={f} className="flex flex-col gap-1">
                <Label className="capitalize text-xs">{f}</Label>
                <Input
                  value={remitente[f]}
                  onChange={e => setRemitente(prev => ({ ...prev, [f]: e.target.value }))}
                  placeholder={f === "cp" ? "Código postal" : f === "email" ? "correo@ejemplo.com" : ""}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Destinatario */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destinatario (destino)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(["nombre", "direccion", "localidad", "provincia", "cp", "telefono", "email"] as const).map(f => (
              <div key={f} className="flex flex-col gap-1">
                <Label className="capitalize text-xs">{f}</Label>
                <Input
                  value={destinatario[f]}
                  onChange={e => setDestinatario(prev => ({ ...prev, [f]: e.target.value }))}
                  placeholder={f === "cp" ? "Código postal" : f === "email" ? "correo@ejemplo.com" : ""}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Paquete */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Paquete
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Peso (gramos)</Label>
            <Input type="number" value={pesoG} onChange={e => setPesoG(e.target.value)} placeholder="500" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Valor declarado ($)</Label>
            <Input type="number" value={valorDeclarado} onChange={e => setValorDeclarado(e.target.value)} placeholder="5000" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Servicio</Label>
            <Select value={servicio} onValueChange={setServicio}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Estándar</SelectItem>
                <SelectItem value="express">Express</SelectItem>
                <SelectItem value="economico">Económico</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Referencia (opcional)</Label>
            <Input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Nro. orden" />
          </div>
        </CardContent>
      </Card>

      {/* Cotizador */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Cotización
          </CardTitle>
          <CardDescription>Consultá el costo antes de confirmar el envío.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            variant="outline"
            onClick={getCotizacion}
            disabled={quoting || !remitente.cp || !destinatario.cp || !pesoG}
          >
            {quoting ? "Cotizando…" : "Obtener cotización"}
          </Button>
          {quoteError && <p className="text-sm text-red-600">{quoteError}</p>}
          {quotes && quotes.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay servicios disponibles para ese tramo.</p>
          )}
          {quotes && quotes.length > 0 && (
            <div className="rounded border divide-y text-sm">
              {quotes.map(q => (
                <div key={q.codigo} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="font-medium">{q.nombre}</span>
                    <span className="ml-2 text-muted-foreground text-xs">{q.plazo_dias} día{q.plazo_dias !== 1 ? "s" : ""}</span>
                  </div>
                  <span className="font-bold">${q.precio.toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acción */}
      {createError && <p className="text-sm text-red-600">{createError}</p>}
      <div className="flex gap-3">
        <Button
          onClick={crearEnvio}
          disabled={creating || !camposOk}
          size="lg"
          className="flex-1"
        >
          <Truck className="mr-2 h-4 w-4" />
          {creating ? "Creando envío…" : "Crear envío"}
        </Button>
        <Button variant="outline" asChild size="lg">
          <Link href="/envios">Cancelar</Link>
        </Button>
      </div>
    </div>
  )
}
