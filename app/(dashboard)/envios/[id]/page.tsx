"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, RefreshCw, ExternalLink, Package, Truck, MapPin, CheckCircle, XCircle, Clock } from "lucide-react"

interface Shipment {
  id: string
  carrier_slug: string | null
  tracking_number: string | null
  status: string
  origin: Record<string, string> | null
  destination: Record<string, string> | null
  items: any[] | null
  weight_g: number | null
  declared_value: number | null
  cost: number | null
  label_url: string | null
  tracking_url: string | null
  created_at: string
  updated_at: string
}

interface TrackingEvent {
  id: string
  status: string
  description: string
  location: string | null
  occurred_at: string
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pendiente", color: "text-yellow-600", icon: Clock },
  in_transit: { label: "En tránsito", color: "text-blue-600", icon: Truck },
  delivered: { label: "Entregado", color: "text-green-600", icon: CheckCircle },
  failed: { label: "Fallido", color: "text-red-600", icon: XCircle },
  returned: { label: "Devuelto", color: "text-orange-600", icon: XCircle },
}

export default function ShipmentDetailPage() {
  const params = useParams()
  const id = params?.id as string

  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [events, setEvents] = useState<TrackingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [tracking, setTracking] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)

  async function loadShipment() {
    setLoading(true)
    const res = await fetch(`/api/envios/shipments/${id}`)
    if (res.ok) {
      const { data } = await res.json()
      setShipment(data.shipment)
      setEvents(data.events ?? [])
    }
    setLoading(false)
  }

  async function refreshTracking() {
    if (!shipment?.tracking_number) return
    setTracking(true)
    setTrackError(null)
    const res = await fetch(`/api/envios/track/${encodeURIComponent(shipment.tracking_number)}`)
    const data = await res.json()
    if (!res.ok) setTrackError(data.error ?? "Error al consultar tracking")
    else await loadShipment()
    setTracking(false)
  }

  useEffect(() => {
    loadShipment()
  }, [id])

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>
  if (!shipment) return <div className="p-6 text-sm text-muted-foreground">Envío no encontrado.</div>

  const st = STATUS_LABELS[shipment.status] ?? { label: shipment.status, color: "text-muted-foreground", icon: Package }
  const StatusIcon = st.icon

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/envios">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-mono">{shipment.tracking_number ?? "Sin guía"}</h1>
            <p className="text-sm text-muted-foreground capitalize">{shipment.carrier_slug ?? "transportista"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-5 w-5 ${st.color}`} />
          <Badge variant="outline" className={st.color}>
            {st.label}
          </Badge>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={refreshTracking} disabled={tracking || !shipment.tracking_number}>
          <RefreshCw className={`mr-2 h-4 w-4 ${tracking ? "animate-spin" : ""}`} />
          {tracking ? "Actualizando…" : "Actualizar tracking"}
        </Button>
        {shipment.label_url && (
          <Button size="sm" asChild>
            <a href={shipment.label_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Descargar etiqueta
            </a>
          </Button>
        )}
        {shipment.tracking_url && (
          <Button variant="outline" size="sm" asChild>
            <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer">
              <Truck className="mr-2 h-4 w-4" />
              Seguimiento externo
            </a>
          </Button>
        )}
      </div>

      {trackError && <p className="text-sm text-red-600">{trackError}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Origen */}
        {shipment.origin && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Remitente
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-0.5">
              <p className="font-medium">{shipment.origin.nombre}</p>
              <p className="text-muted-foreground">{shipment.origin.direccion}</p>
              <p className="text-muted-foreground">
                {shipment.origin.localidad}, {shipment.origin.provincia} ({shipment.origin.cp})
              </p>
              {shipment.origin.telefono && <p className="text-muted-foreground">{shipment.origin.telefono}</p>}
            </CardContent>
          </Card>
        )}

        {/* Destino */}
        {shipment.destination && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Destinatario
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-0.5">
              <p className="font-medium">{shipment.destination.nombre}</p>
              <p className="text-muted-foreground">{shipment.destination.direccion}</p>
              <p className="text-muted-foreground">
                {shipment.destination.localidad}, {shipment.destination.provincia} ({shipment.destination.cp})
              </p>
              {shipment.destination.telefono && (
                <p className="text-muted-foreground">{shipment.destination.telefono}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Info del paquete */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4" />
            Paquete
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Peso</p>
            <p className="font-medium">{shipment.weight_g ? `${shipment.weight_g}g` : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Valor declarado</p>
            <p className="font-medium">
              {shipment.declared_value ? `$${shipment.declared_value.toLocaleString("es-AR")}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Costo envío</p>
            <p className="font-medium">{shipment.cost ? `$${shipment.cost.toLocaleString("es-AR")}` : "—"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Timeline de tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de seguimiento</CardTitle>
          <CardDescription>
            {events.length === 0
              ? "Sin eventos registrados aún. Hacé clic en «Actualizar tracking»."
              : `${events.length} evento${events.length !== 1 ? "s" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sin movimientos registrados.</p>
          ) : (
            <ol className="relative border-l border-muted ml-3 space-y-4">
              {[...events]
                .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
                .map((ev, i) => (
                  <li key={ev.id ?? i} className="ml-4">
                    <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background bg-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      {new Date(ev.occurred_at).toLocaleString("es-AR")}
                      {ev.location && ` — ${ev.location}`}
                    </p>
                    <p className="text-sm font-medium">{ev.description}</p>
                    <Badge variant="outline" className="text-xs mt-0.5">
                      {ev.status}
                    </Badge>
                  </li>
                ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
