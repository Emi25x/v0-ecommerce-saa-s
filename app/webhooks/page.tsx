"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { RefreshCw, Webhook, CheckCircle, XCircle, Clock, AlertTriangle, Play, Database } from "lucide-react"

interface WebhookStats {
  total: number
  pending: number
  processed: number
  failed: number
  orders: number
  shipments: number
  items: number
}

interface WebhookNotification {
  id: string
  topic: string
  resource: string
  user_id: string
  processed: boolean
  created_at: string
  processed_at?: string
  error_message?: string
}

export default function WebhooksPage() {
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [stats, setStats] = useState<WebhookStats>({
    total: 0,
    pending: 0,
    processed: 0,
    failed: 0,
    orders: 0,
    shipments: 0,
    items: 0,
  })
  const [recentNotifications, setRecentNotifications] = useState<WebhookNotification[]>([])
  const [webhookUrl, setWebhookUrl] = useState("")
  const [needsMigration, setNeedsMigration] = useState(false)

  useEffect(() => {
    const baseUrl = window.location.origin
    setWebhookUrl(`${baseUrl}/api/mercadolibre/webhooks`)
    loadWebhookData()
  }, [])

  async function loadWebhookData() {
    try {
      setLoading(true)
      const response = await fetch("/api/mercadolibre/webhooks/stats")

      if (!response.ok) {
        const error = await response.json()
        if (error.needsMigration) {
          setNeedsMigration(true)
        }
        throw new Error("Failed to load webhook data")
      }

      const data = await response.json()
      setStats(data.stats || stats)
      setRecentNotifications(data.recent || [])
      setNeedsMigration(false)
    } catch (error) {
      console.error("Error loading webhook data:", error)
    } finally {
      setLoading(false)
    }
  }

  async function processQueue() {
    try {
      setProcessing(true)
      const response = await fetch("/api/mercadolibre/webhooks/process", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to process queue")
      }

      const data = await response.json()
      alert(`Procesamiento completado:\n✓ ${data.results.processed} procesados\n✗ ${data.results.failed} fallidos`)
      await loadWebhookData()
    } catch (error) {
      console.error("Error processing queue:", error)
      alert("Error al procesar la cola de webhooks")
    } finally {
      setProcessing(false)
    }
  }

  async function runMigration() {
    try {
      setProcessing(true)
      const response = await fetch("/api/database/run-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: "create_webhook_tables.sql" }),
      })

      if (!response.ok) {
        throw new Error("Failed to run migration")
      }

      alert("Tablas de webhooks creadas exitosamente")
      await loadWebhookData()
    } catch (error) {
      console.error("Error running migration:", error)
      alert("Error al crear las tablas. Ejecuta el script manualmente desde la sección de Scripts.")
    } finally {
      setProcessing(false)
    }
  }

  function copyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl)
    alert("URL copiada al portapapeles")
  }

  function getTopicBadge(topic: string) {
    const config: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
      orders_v2: { variant: "default", label: "Órdenes" },
      shipments: { variant: "secondary", label: "Envíos" },
      items: { variant: "outline", label: "Productos" },
    }
    const { variant, label } = config[topic] || { variant: "outline" as const, label: topic }
    return <Badge variant={variant}>{label}</Badge>
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <Webhook className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Ecommerce Manager</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Webhooks</h2>
            <p className="text-muted-foreground">Gestiona las notificaciones de MercadoLibre</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={loadWebhookData} disabled={loading} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualizar
            </Button>
            <Button onClick={processQueue} disabled={processing || stats.pending === 0}>
              <Play className="mr-2 h-4 w-4" />
              Procesar Cola ({stats.pending})
            </Button>
          </div>
        </div>

        {needsMigration && (
          <Alert className="mb-6 border-orange-500">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Configuración Requerida</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-3">
                Las tablas de webhooks no existen en tu base de datos. Necesitas ejecutar el script SQL para crearlas.
              </p>
              <div className="flex gap-2">
                <Button onClick={runMigration} disabled={processing} size="sm">
                  <Database className="mr-2 h-4 w-4" />
                  Crear Tablas Automáticamente
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="/scripts">Ver Scripts</a>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Webhook URL Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Configuración del Webhook</CardTitle>
            <CardDescription>
              Configura esta URL en tu aplicación de MercadoLibre para recibir notificaciones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-4 py-2 text-sm font-mono">{webhookUrl}</code>
                <Button onClick={copyWebhookUrl} variant="outline">
                  Copiar
                </Button>
              </div>
              <div className="rounded-lg bg-muted/50 p-4 text-sm">
                <p className="font-medium mb-2">Pasos para configurar:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Ve a tu aplicación en el panel de desarrolladores de MercadoLibre</li>
                  <li>Edita la configuración de la aplicación</li>
                  <li>Pega esta URL en el campo "Notifications Callback URL"</li>
                  <li>Selecciona los topics: orders_v2, shipments, items</li>
                  <li>Guarda los cambios</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Recibidos</CardTitle>
              <Webhook className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Todas las notificaciones</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">Por procesar</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Procesados</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.processed}</div>
              <p className="text-xs text-muted-foreground">Completados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fallidos</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.failed}</div>
              <p className="text-xs text-muted-foreground">Con errores</p>
            </CardContent>
          </Card>
        </div>

        {/* Topic Stats */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Órdenes</CardTitle>
              <Badge variant="default">orders_v2</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.orders}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Envíos</CardTitle>
              <Badge variant="secondary">shipments</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.shipments}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Productos</CardTitle>
              <Badge variant="outline">items</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.items}</div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Notificaciones Recientes</CardTitle>
            <CardDescription>Últimas 50 notificaciones recibidas</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Cargando notificaciones...
              </div>
            ) : recentNotifications.length === 0 ? (
              <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Webhook className="h-12 w-12 opacity-20" />
                <p>No hay notificaciones recibidas aún</p>
                <p className="text-xs">Las notificaciones aparecerán aquí cuando MercadoLibre las envíe</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Topic</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Recibido</TableHead>
                    <TableHead>Procesado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentNotifications.map((notification) => (
                    <TableRow key={notification.id}>
                      <TableCell>{getTopicBadge(notification.topic)}</TableCell>
                      <TableCell className="font-mono text-xs">{notification.resource}</TableCell>
                      <TableCell className="text-sm">{notification.user_id}</TableCell>
                      <TableCell>
                        {notification.processed ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Procesado
                          </Badge>
                        ) : notification.error_message ? (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Error
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <Clock className="h-3 w-3" />
                            Pendiente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(notification.created_at).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {notification.processed_at
                          ? new Date(notification.processed_at).toLocaleString("es-AR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
