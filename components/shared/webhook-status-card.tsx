"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Bell, CheckCircle2, RefreshCw, Info, Copy, Check, AlertTriangle } from "lucide-react"

export function WebhookStatusCard() {
  const [webhookUrl, setWebhookUrl] = useState("")
  const [copied, setCopied] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [queueCount, setQueueCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Construir la URL del webhook
    const baseUrl = window.location.origin
    const url = `${baseUrl}/api/mercadolibre/webhooks`
    setWebhookUrl(url)

    fetchQueueCount()
  }, [])

  const fetchQueueCount = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/mercadolibre/webhooks/queue")
      if (!response.ok) {
        throw new Error("Failed to fetch queue")
      }
      const data = await response.json()
      setQueueCount(data.count || 0)
    } catch (error) {
      console.error("Error fetching queue:", error)
      setError("No se pudo cargar la cola de webhooks")
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }

  const processQueue = async () => {
    setProcessing(true)
    setError(null)
    try {
      const response = await fetch("/api/mercadolibre/webhooks/process", {
        method: "POST",
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Error desconocido" }))
        throw new Error(errorData.error || `Error ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        alert(`✓ Procesadas ${data.results.processed} notificaciones exitosamente`)
        if (data.results.failed > 0) {
          setError(`${data.results.failed} notificaciones fallaron. Revisa los logs para más detalles.`)
        }
        fetchQueueCount()
      } else {
        throw new Error(data.error || "Error al procesar notificaciones")
      }
    } catch (error) {
      console.error("Error processing queue:", error)
      const errorMessage = error instanceof Error ? error.message : "Error desconocido"
      setError(errorMessage)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <Bell className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Webhooks de MercadoLibre</CardTitle>
              <CardDescription>Notificaciones en tiempo real</CardDescription>
            </div>
          </div>
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Configurado
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Configura esta URL en tu aplicación de MercadoLibre para recibir notificaciones automáticas de órdenes,
            envíos y productos.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label>URL del Webhook</Label>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={copyToClipboard}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Copia esta URL y configúrala en{" "}
            <a
              href="https://developers.mercadolibre.com.ar/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Mis Aplicaciones
            </a>
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Topics Configurados</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>orders_v2 - Notificaciones de órdenes</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>shipments - Notificaciones de envíos</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>items - Notificaciones de productos</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Cola de Procesamiento</p>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? "Cargando..."
                  : queueCount > 0
                    ? `${queueCount} notificaciones pendientes`
                    : "No hay notificaciones pendientes"}
              </p>
            </div>
            <Button onClick={processQueue} disabled={processing || loading} size="sm" variant="outline">
              <RefreshCw className={`mr-2 h-4 w-4 ${processing ? "animate-spin" : ""}`} />
              {processing ? "Procesando..." : "Procesar Cola"}
            </Button>
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Instrucciones de configuración:</strong>
            <ol className="mt-2 ml-4 list-decimal space-y-1">
              <li>Ve a tu aplicación en MercadoLibre Developers</li>
              <li>En "Notifications Callback URL", pega la URL del webhook</li>
              <li>Selecciona los topics: orders_v2, shipments, items</li>
              <li>Guarda los cambios</li>
            </ol>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
