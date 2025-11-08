"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const Bell = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
    />
  </svg>
)

const CheckCircle2 = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 12 2 2 4-4" />
  </svg>
)

const RefreshCw = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
)

const Info = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-4m0-4h.01" />
  </svg>
)

const Copy = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
    />
  </svg>
)

const Check = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const AlertTriangle = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
)

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
      console.error("[v0] Error fetching queue:", error)
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
      console.error("[v0] Error processing queue:", error)
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
