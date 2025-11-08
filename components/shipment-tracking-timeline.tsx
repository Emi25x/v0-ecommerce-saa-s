"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, Package, Truck, CheckCircle, XCircle, Clock, MapPin } from "lucide-react"
import type { JSX } from "react/jsx-runtime" // Import JSX to fix the undeclared variable error

interface TrackingEvent {
  status: string
  substatus?: string
  date: string
  description?: string
}

interface ShipmentTrackingProps {
  shipmentId: number
  initialStatus?: string
}

export function ShipmentTrackingTimeline({ shipmentId, initialStatus }: ShipmentTrackingProps) {
  const [loading, setLoading] = useState(true)
  const [tracking, setTracking] = useState<TrackingEvent[]>([])
  const [currentStatus, setCurrentStatus] = useState(initialStatus || "")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTracking()
  }, [shipmentId])

  async function loadTracking() {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/mercadolibre/shipments/${shipmentId}`)

      if (!response.ok) {
        throw new Error("Failed to fetch tracking")
      }

      const data = await response.json()

      // Extract tracking events from status_history
      const events: TrackingEvent[] = []

      if (data.status_history) {
        // Add all status changes from history
        Object.entries(data.status_history).forEach(([key, value]) => {
          if (value && typeof value === "string") {
            const statusName = key.replace("date_", "").replace(/_/g, " ")
            events.push({
              status: statusName,
              date: value as string,
              description: getStatusDescription(statusName),
            })
          }
        })
      }

      // Add current status if not in history
      if (data.status && !events.find((e) => e.status === data.status)) {
        events.push({
          status: data.status,
          substatus: data.substatus,
          date: data.last_updated || data.date_created,
          description: getStatusDescription(data.status),
        })
      }

      // Sort by date (most recent first)
      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      setTracking(events)
      setCurrentStatus(data.status)
    } catch (error) {
      console.error("Error loading tracking:", error)
      setError("No se pudo cargar el tracking del envío")
    } finally {
      setLoading(false)
    }
  }

  function getStatusDescription(status: string): string {
    const descriptions: Record<string, string> = {
      pending: "El envío está pendiente de procesamiento",
      handling: "El vendedor está preparando el paquete",
      ready_to_ship: "El paquete está listo para ser enviado",
      shipped: "El paquete ha sido enviado",
      delivered: "El paquete fue entregado exitosamente",
      not_delivered: "El paquete no pudo ser entregado",
      cancelled: "El envío fue cancelado",
      first_visit: "Primera visita de entrega",
      returned_to_sender: "El paquete está siendo devuelto al remitente",
    }
    return descriptions[status] || "Actualización de estado"
  }

  function getStatusIcon(status: string): JSX.Element {
    const icons: Record<string, JSX.Element> = {
      pending: <Clock className="h-5 w-5 text-gray-500" />,
      handling: <Package className="h-5 w-5 text-blue-500" />,
      ready_to_ship: <Package className="h-5 w-5 text-green-500" />,
      shipped: <Truck className="h-5 w-5 text-blue-600" />,
      delivered: <CheckCircle className="h-5 w-5 text-green-600" />,
      not_delivered: <XCircle className="h-5 w-5 text-red-600" />,
      cancelled: <XCircle className="h-5 w-5 text-gray-600" />,
      first_visit: <MapPin className="h-5 w-5 text-orange-500" />,
    }
    return icons[status] || <Clock className="h-5 w-5 text-gray-500" />
  }

  function getStatusBadge(status: string) {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      handling: "outline",
      ready_to_ship: "default",
      shipped: "default",
      delivered: "secondary",
      not_delivered: "destructive",
      cancelled: "destructive",
    }
    return variants[status] || "outline"
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center text-sm text-muted-foreground">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Cargando tracking...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <XCircle className="h-8 w-8 text-red-500" />
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={loadTracking}>
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tracking del Envío</CardTitle>
            <CardDescription>Historial completo de eventos</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadTracking} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {tracking.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Clock className="h-8 w-8 opacity-20" />
            <p>No hay eventos de tracking disponibles</p>
          </div>
        ) : (
          <div className="relative space-y-4">
            {/* Timeline line */}
            <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-border" />

            {tracking.map((event, index) => (
              <div key={index} className="relative flex gap-4">
                {/* Icon */}
                <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-card">
                  {getStatusIcon(event.status)}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={getStatusBadge(event.status)} className="capitalize">
                          {event.status.replace(/_/g, " ")}
                        </Badge>
                        {event.substatus && (
                          <Badge variant="outline" className="text-xs">
                            {event.substatus}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">{event.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.date).toLocaleString("es-AR", {
                          dateStyle: "full",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
