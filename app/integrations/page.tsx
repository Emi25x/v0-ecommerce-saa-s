"use client"

import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast" // Import toast
import { Copy } from "@/components/ui/icons/copy" // Import Copy icon

const Package = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const ExternalLink = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

const CheckCircle2 = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

const XCircle = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6M9 9l6 6" />
  </svg>
)

const Plus = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14M12 5v14" />
  </svg>
)

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { LibralConfigDialog } from "@/components/integrations/libral-config-dialog"
import { WebhookStatusCard } from "@/components/webhook-status-card"
import { MLAccountCard } from "@/components/ml-account-card"


export default function IntegrationsPage() {
  const [shopifyConnected, setShopifyConnected] = useState(false)
  const [testingShopify, setTestingShopify] = useState(false)
  const [mlConnected, setMlConnected] = useState(false)
  const [libralConnected, setLibralConnected] = useState(false)
  const [showLibralConfig, setShowLibralConfig] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [testingLibralAuth, setTestingLibralAuth] = useState(false)
  const [authTestResults, setAuthTestResults] = useState<string | null>(null)
  const [testingDiagnosis, setTestingDiagnosis] = useState(false)
  const [diagnosisResults, setDiagnosisResults] = useState<string | null>(null)
  const [mlAccounts, setMlAccounts] = useState<any[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [runningMigration, setRunningMigration] = useState(false)
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null)

  useEffect(() => {
    testShopifyConnection()
    fetchMlAccounts()
    checkLibralConnection()

    const params = new URLSearchParams(window.location.search)
    const mlConnectedParam = params.get("ml_connected")
    const mlUser = params.get("ml_user")
    const error = params.get("error")
    const message = params.get("message")

    if (mlConnectedParam === "true") {
      checkMlConnection()
      setSuccessMessage(`Mercado Libre conectado exitosamente${mlUser ? ` como ${mlUser}` : ""}`)
    }

    if (error) {
      let errorText = "Error al conectar con Mercado Libre"
      if (error === "no_code") {
        errorText = "No se recibió código de autorización"
      } else if (error === "auth_failed") {
        errorText = message ? decodeURIComponent(message) : "Falló la autenticación"
      } else if (error === "ml_error") {
        errorText = message ? `Error de Mercado Libre: ${message}` : "Error de Mercado Libre"
      }
      setErrorMessage(errorText)
    }

    if (params.toString()) {
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  useEffect(() => {
    console.log("[v0] mlAccounts changed. New length:", mlAccounts.length)
    console.log("[v0] mlAccounts content:", mlAccounts)
  }, [mlAccounts])

  const checkMlConnection = async () => {
    try {
      const response = await fetch("/api/mercadolibre/status")
      const data = await response.json()
      console.log("[v0] ML connection status:", data)
      setMlConnected(data.connected)
    } catch (error) {
      console.error("[v0] Failed to check ML connection:", error)
      setMlConnected(false)
    }
  }

  const testShopifyConnection = async () => {
    setTestingShopify(true)
    try {
      const response = await fetch("/api/shopify/test-connection")
      const data = await response.json()
      setShopifyConnected(data.connected)
    } catch (error) {
      console.error("[v0] Failed to test Shopify connection:", error)
      setShopifyConnected(false)
    } finally {
      setTestingShopify(false)
    }
  }

  const checkLibralConnection = async () => {
    try {
      const response = await fetch("/api/libral/test-connection")
      const data = await response.json()
      setLibralConnected(data.connected)
    } catch (error) {
      console.error("[v0] Failed to check Libral connection:", error)
      setLibralConnected(false)
    }
  }

  const testLibralAuth = async () => {
    setTestingLibralAuth(true)
    setAuthTestResults(null)
    try {
      const response = await fetch("/api/libral/test-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "LIBRAL_APP",
          password: "JH7kl%64321",
        }),
      })
      const data = await response.json()
      setAuthTestResults(JSON.stringify(data, null, 2))
    } catch (error) {
      console.error("[v0] Failed to test Libral auth:", error)
      setAuthTestResults(`Error: ${error}`)
    } finally {
      setTestingLibralAuth(false)
    }
  }

  const runDiagnosis = async () => {
    setTestingDiagnosis(true)
    setDiagnosisResults(null)
    try {
      const response = await fetch("/api/libral/diagnose")
      const data = await response.json()
      setDiagnosisResults(JSON.stringify(data, null, 2))
    } catch (error) {
      console.error("[v0] Failed to run diagnosis:", error)
      setDiagnosisResults(`Error: ${error}`)
    } finally {
      setTestingDiagnosis(false)
    }
  }

  const fetchMlAccounts = async () => {
    try {
      console.log("[v0] Fetching ML accounts...")
      const response = await fetch("/api/mercadolibre/accounts")
      console.log("[v0] Response status:", response.status)

      const data = await response.json()
      console.log("[v0] Response data:", data)

      if (data.accounts && Array.isArray(data.accounts)) {
        console.log("[v0] Setting", data.accounts.length, "ML accounts")
        setMlAccounts(data.accounts)
      } else {
        console.log("[v0] No accounts array in response, setting empty array")
        setMlAccounts([])
      }
    } catch (error) {
      console.error("[v0] Failed to fetch ML accounts:", error)
      setMlAccounts([])
    } finally {
      setLoadingAccounts(false)
    }
  }

  const runMigration = async () => {
    setRunningMigration(true)
    setMigrationMessage(null)
    try {
      const response = await fetch("/api/mercadolibre/migrate-browser-preference", {
        method: "POST",
      })
      const data = await response.json()

      if (data.success) {
        setMigrationMessage("✓ Migración completada exitosamente")
        setSuccessMessage("Base de datos actualizada. Ahora puedes configurar el navegador preferido para cada cuenta.")
        // Recargar las cuentas para obtener el nuevo campo
        fetchMlAccounts()
      } else {
        setMigrationMessage(`✗ Error: ${data.error}`)
        setErrorMessage(`Error en la migración: ${data.error}`)
      }
    } catch (error) {
      console.error("[v0] Migration failed:", error)
      setMigrationMessage(`✗ Error: ${error}`)
      setErrorMessage("Error al ejecutar la migración")
    } finally {
      setRunningMigration(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Ecommerce Manager</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Integraciones</h2>
          <p className="text-muted-foreground">Conecta y gestiona tus plataformas de ecommerce</p>
        </div>

        {successMessage && (
          <Alert className="mb-6 border-green-500/50 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-500">{successMessage}</AlertDescription>
          </Alert>
        )}

        {errorMessage && (
          <Alert className="mb-6 border-destructive/50 bg-destructive/10">
            <XCircle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-destructive">{errorMessage}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                    <Package className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle>Libral ERP</CardTitle>
                    <CardDescription>Sistema de gestión interno</CardDescription>
                  </div>
                </div>
                <Badge variant={libralConnected ? "default" : "secondary"} className="gap-1">
                  {libralConnected ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Conectado
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3" />
                      Desconectado
                    </>
                  )}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Conecta tu ERP Libral para importar productos, sincronizar stock y gestionar pedidos automáticamente.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>Importación de productos</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>Sincronización de stock</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>Gestión de pedidos</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setShowLibralConfig(true)} className="flex-1">
                  {libralConnected ? "Reconfigurar" : "Conectar"}
                </Button>
                <Button onClick={runDiagnosis} disabled={testingDiagnosis} variant="outline">
                  {testingDiagnosis ? "Diagnosticando..." : "Diagnosticar"}
                </Button>
              </div>
              {diagnosisResults && (
                <div className="rounded-lg bg-muted p-4">
                  <p className="mb-2 text-sm font-medium">Resultados de diagnóstico:</p>
                  <pre className="max-h-96 overflow-auto text-xs">{diagnosisResults}</pre>
                </div>
              )}
              {authTestResults && (
                <div className="rounded-lg bg-muted p-4">
                  <p className="mb-2 text-sm font-medium">Resultados de prueba:</p>
                  <pre className="overflow-auto text-xs">{authTestResults}</pre>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" />
                    </svg>
                  </div>
                  <div>
                    <CardTitle>Mercado Libre</CardTitle>
                    <CardDescription>API de Mercado Libre</CardDescription>
                  </div>
                </div>
                <Badge variant={mlConnected ? "default" : "secondary"} className="gap-1">
                  {mlConnected ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Conectado
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3" />
                      Desconectado
                    </>
                  )}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Conecta tu cuenta de Mercado Libre para sincronizar productos, gestionar inventario y actualizar
                precios automáticamente.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>Sincronización de productos</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>Gestión de inventario</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>Actualización de precios</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button asChild className="flex-1">
                  <a href="/api/mercadolibre/auth">{mlConnected ? "Reconectar" : "Conectar"}</a>
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href="https://developers.mercadolibre.com.ar" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              
              {/* Link a plantillas de publicación */}
              <div className="pt-3 border-t">
                <Button variant="outline" className="w-full bg-transparent" asChild>
                  <a href="/integrations/ml-templates">Configurar Plantillas de Publicacion</a>
                </Button>
              </div>

              {/* Link de autorización para copiar */}
              <div className="pt-3 border-t">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Link de autorización (para conectar cualquier cuenta)
                </label>
                <div className="flex items-center gap-2">
                  <Input 
                    value={typeof window !== 'undefined' ? `${window.location.origin}/api/mercadolibre/auth` : '/api/mercadolibre/auth'}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const url = `${window.location.origin}/api/mercadolibre/auth`
                      navigator.clipboard.writeText(url)
                      toast({
                        title: "Link copiado",
                        description: "El link de autorización fue copiado al portapapeles",
                      })
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M15.337 2.126c-.011-.016-.023-.031-.037-.044a.095.095 0 0 0-.065-.027c-.011 0-1.195.054-1.195.054s-.93-.905-1.032-1.006c-.102-.102-.3-.073-.377-.05 0 0-.188.058-.5.155-.07-.203-.178-.454-.327-.708-.456-.776-1.122-1.185-1.926-1.185h-.06c-.29-.367-.647-.53-.908-.53C8.683-1.215 8.5-.99 8.37-.67c-.326.8-.6 1.797-.77 2.43-.53.164-1.006.31-1.337.413-.515.16-.53.176-.597.664-.05.37-1.368 10.533-1.368 10.533l10.639 2.005 4.813-1.19S15.348 2.142 15.337 2.126zm-3.13-.49l-.84.26c0-.01.002-1.17.002-1.17.405.03.68.48.838.91zm-1.376.425l-1.607.497c.156-.59.447-1.176.795-1.563.12-.133.285-.296.48-.43.002.51.01 1.23.332 1.496zm-.87-2.09c.11 0 .22.036.325.11-.47.23-.94.65-1.29 1.27-.43.76-.67 1.61-.76 2.25l-1.32.41c.17-.77 1.04-3.81 3.04-4.04z" />
                    </svg>
                  </div>
                  <div>
                    <CardTitle>Shopify</CardTitle>
                    <CardDescription>API de Shopify</CardDescription>
                  </div>
                </div>
                <Badge variant={shopifyConnected ? "default" : "secondary"} className="gap-1">
                  {shopifyConnected ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Conectado
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3" />
                      Desconectado
                    </>
                  )}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Conecta tu tienda Shopify para sincronizar productos, gestionar inventario y mantener todo
                actualizado.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>Sincronización de productos</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>Gestión de inventario</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>Actualización de precios</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={testShopifyConnection} disabled={testingShopify} className="flex-1">
                  {testingShopify ? "Probando..." : shopifyConnected ? "Reconectar" : "Probar Conexión"}
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href="https://shopify.dev" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-semibold">Cuentas de Mercado Libre</h3>
              <p className="text-sm text-muted-foreground">Gestiona múltiples cuentas de Mercado Libre</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={runMigration} disabled={runningMigration} variant="outline">
                {runningMigration ? "Ejecutando..." : "Actualizar BD"}
              </Button>
              <Button asChild>
                <a href="/api/mercadolibre/auth">
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar Cuenta
                </a>
              </Button>
            </div>
          </div>

          {migrationMessage && (
            <Alert className="mb-4">
              <AlertDescription>{migrationMessage}</AlertDescription>
            </Alert>
          )}

          {loadingAccounts ? (
            <div className="text-center py-8 text-muted-foreground">Cargando cuentas...</div>
          ) : mlAccounts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">No hay cuentas de Mercado Libre conectadas</p>
                <Button asChild>
                  <a href="/api/mercadolibre/auth">
                    <Plus className="mr-2 h-4 w-4" />
                    Conectar Primera Cuenta
                  </a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mlAccounts.map((account, index) => (
                <MLAccountCard
                  key={account.id || index}
                  account={account}
                  onUpdate={fetchMlAccounts}
                  onDelete={fetchMlAccounts}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          <h3 className="mb-4 text-xl font-semibold">Notificaciones en Tiempo Real</h3>
          <WebhookStatusCard />
        </div>
      </main>

      <LibralConfigDialog
        open={showLibralConfig}
        onOpenChange={setShowLibralConfig}
        onSuccess={() => {
          checkLibralConnection()
          setSuccessMessage("Libral ERP conectado exitosamente")
        }}
      />
    </div>
  )
}
