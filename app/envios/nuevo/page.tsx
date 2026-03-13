"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Calculator, Package, Truck, ExternalLink, CheckCircle, Send } from "lucide-react"

interface QuoteService {
  codigo:     string
  nombre:     string
  plazo_dias: number
  precio:     number
  descripcion?: string
}

interface Carrier {
  id:   string
  name: string
  slug: string
}

export default function NuevoEnvioPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  // Carriers disponibles
  const [carriers, setCarriers]         = useState<Carrier[]>([])
  const [carrierSlug, setCarrierSlug]   = useState("cabify")

  // Datos de Shopify (si viene desde la lista de pedidos)
  const shopifyOrderId  = searchParams.get("shopify_order_id")  ?? ""
  const shopifyOrderName = searchParams.get("ref") ?? ""
  const shopifyStoreId  = searchParams.get("store_id") ?? ""

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
  const [servicio, setServicio]             = useState("express")
  const [referencia, setReferencia]         = useState(searchParams.get("ref")    ?? "")

  const [quoting, setQuoting]       = useState(false)
  const [quotes, setQuotes]         = useState<QuoteService[] | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const [creating, setCreating]         = useState(false)
  const [result, setResult]             = useState<any | null>(null)
  const [createError, setCreateError]   = useState<string | null>(null)

  // Estado de notificación Shopify
  const [fulfilling, setFulfilling]     = useState(false)
  const [fulfillResult, setFulfillResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Cargar transportistas activos
  useEffect(() => {
    fetch("/api/envios/carriers")
      .then(r => r.json())
      .then(d => {
        const active = (d.data ?? []).filter((c: any) => c.active)
        setCarriers(active)
        // Si cabify está activo usarlo por defecto, sino el primero disponible
        const hasCabify = active.some((c: any) => c.slug === "cabify")
        if (!hasCabify && active.length > 0) setCarrierSlug(active[0].slug)
      })
      .catch(console.error)
  }, [])

  async function getCotizacion() {
    if (!remitente.cp || !destinatario.cp || !pesoG) return
    setQuoting(true)
    setQuoteError(null)
    setQuotes(null)
    const res = await fetch("/api/envios/quote", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        carrier_slug: carrierSlug,
        origen_cp:    remitente.cp,
        destino_cp:   destinatario.cp,
        peso_g:       parseInt(pesoG),
        valor:        parseFloat(valorDeclarado) || 0,
      }),
    })
    const data = await res.json()
    if (!res.ok) setQuoteError(data.error ?? "Error al cotizar")
    else         setQuotes(data.servicios ?? [])
    setQuoting(false)
  }

  async function crearEnvio() {
    setCreating(true)
    setCreateError(null)

    // Adaptar el cuerpo según el carrier
    const isCabify = carrierSlug === "cabify"
    const shipmentBody = isCabify
      ? {
          // Cabify: pickup / delivery + service
          service:         servicio,
          reference:       referencia || undefined,
          pickup: {
            name:         remitente.nombre,
            phone:        remitente.telefono,
            email:        remitente.email || undefined,
            street:       remitente.direccion,
            city:         remitente.localidad,
            state:        remitente.provincia,
            postal_code:  remitente.cp,
            country:      "AR",
          },
          delivery: {
            name:         destinatario.nombre,
            phone:        destinatario.telefono,
            email:        destinatario.email || undefined,
            street:       destinatario.direccion,
            city:         destinatario.localidad,
            state:        destinatario.provincia,
            postal_code:  destinatario.cp,
            country:      "AR",
          },
          items:           [],
          weight_g:        parseInt(pesoG) || 0,
          declared_value:  parseFloat(valorDeclarado) || 0,
        }
      : {
          // FastMail y otros: remitente / destinatario
          remitente,
          destinatario,
          items:           [],
          peso_total_g:    parseInt(pesoG) || 0,
          valor_declarado: parseFloat(valorDeclarado) || 0,
          servicio,
          referencia:      referencia || undefined,
        }

    const res = await fetch("/api/envios/create-shipment", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ carrier_slug: carrierSlug, shipment: shipmentBody }),
    })
    const data = await res.json()
    if (!res.ok) setCreateError(data.error ?? "Error al crear envío")
    else         setResult(data)
    setCreating(false)
  }

  async function fulfillShopifyOrder() {
    if (!result?.tracking_number || !shopifyOrderId || !shopifyStoreId) return
    setFulfilling(true)
    setFulfillResult(null)

    const carrierLabel = carriers.find(c => c.slug === carrierSlug)?.name ?? carrierSlug

    const res = await fetch("/api/shopify/fulfill-order", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        store_id:        shopifyStoreId,
        order_id:        shopifyOrderId,
        tracking_number: result.tracking_number,
        tracking_url:    result.tracking_url ?? undefined,
        carrier_name:    carrierLabel,
        notify_customer: true,
      }),
    })
    const data = await res.json()
    setFulfillResult({
      ok:      res.ok && data.ok,
      message: data.message ?? data.error ?? (res.ok ? "Listo" : "Error"),
    })
    setFulfilling(false)
  }

  const camposOk =
    remitente.nombre && remitente.direccion && remitente.cp &&
    destinatario.nombre && destinatario.direccion && destinatario.cp &&
    pesoG && valorDeclarado

  // ── Pantalla de éxito ──────────────────────────────────────────────────────
  if (result) {
    const canFulfillShopify = shopifyOrderId && shopifyStoreId

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
              <span className="text-muted-foreground">Transportista</span>
              <span className="font-medium capitalize">{carrierSlug}</span>
              <span className="text-muted-foreground">Nro. guía</span>
              <span className="font-mono font-bold">{result.tracking_number ?? "—"}</span>
              <span className="text-muted-foreground">Estado</span>
              <Badge variant="secondary">{result.estado ?? "—"}</Badge>
              {result.costo != null && (
                <>
                  <span className="text-muted-foreground">Costo</span>
                  <span className="font-bold">${Number(result.costo).toLocaleString("es-AR")}</span>
                </>
              )}
              {shopifyOrderName && (
                <>
                  <span className="text-muted-foreground">Pedido Shopify</span>
                  <span className="font-medium">{shopifyOrderName}</span>
                </>
              )}
            </div>

            {/* Botón fulfillment Shopify */}
            {canFulfillShopify && !fulfillResult && (
              <div className="mt-2 rounded-md border bg-blue-50 dark:bg-blue-950/20 border-blue-200 p-3 flex flex-col gap-2">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  ¿Marcar como enviado en Shopify?
                </p>
                <p className="text-xs text-muted-foreground">
                  Shopify actualizará el pedido y enviará el email de envío al cliente con el número de tracking.
                </p>
                <Button
                  size="sm"
                  onClick={fulfillShopifyOrder}
                  disabled={fulfilling}
                  className="self-start"
                >
                  <Send className="mr-2 h-3.5 w-3.5" />
                  {fulfilling ? "Notificando a Shopify…" : "Sí, marcar como enviado y notificar cliente"}
                </Button>
              </div>
            )}

            {fulfillResult && (
              <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                fulfillResult.ok
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {fulfillResult.ok
                  ? <CheckCircle className="h-4 w-4 shrink-0" />
                  : <span className="shrink-0">⚠</span>
                }
                {fulfillResult.message}
              </div>
            )}

            <div className="flex gap-2 pt-2 flex-wrap">
              {result.label_url && (
                <Button asChild size="sm">
                  <a href={result.label_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Descargar etiqueta
                  </a>
                </Button>
              )}
              {result.tracking_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={result.tracking_url} target="_blank" rel="noopener noreferrer">
                    <Truck className="mr-2 h-4 w-4" />
                    Ver tracking
                  </a>
                </Button>
              )}
              {result.shipment_id && (
                <Button variant="outline" size="sm" onClick={() => router.push(`/envios/${result.shipment_id}`)}>
                  Seguimiento interno
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

  // ── Formulario ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/envios"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nuevo envío</h1>
          {shopifyOrderName && (
            <p className="text-sm text-muted-foreground">Pedido Shopify {shopifyOrderName}</p>
          )}
        </div>
      </div>

      {/* Transportista */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Transportista
          </CardTitle>
        </CardHeader>
        <CardContent>
          {carriers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay transportistas activos. Activá uno en <Link href="/envios/transportistas" className="underline">Transportistas</Link>.</p>
          ) : (
            <Select value={carrierSlug} onValueChange={v => { setCarrierSlug(v); setQuotes(null) }}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {carriers.map(c => (
                  <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

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
                {carrierSlug === "cabify" ? (
                  <>
                    <SelectItem value="express">Express (horas)</SelectItem>
                    <SelectItem value="same_day">Mismo día</SelectItem>
                    <SelectItem value="next_day">Día siguiente</SelectItem>
                    <SelectItem value="scheduled">Programado</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="standard">Estándar</SelectItem>
                    <SelectItem value="express">Express</SelectItem>
                    <SelectItem value="economico">Económico</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Referencia</Label>
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
                    {q.descripcion && <span className="ml-2 text-muted-foreground text-xs">{q.descripcion}</span>}
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
          disabled={creating || !camposOk || carriers.length === 0}
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
