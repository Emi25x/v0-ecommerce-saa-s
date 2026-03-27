"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  CheckCircle2 as CheckCircle,
  XCircle,
  Settings,
  Trash2 as Trash,
  Pencil as Edit,
  Check,
  RefreshCw,
  X,
  ExternalLink,
  Globe,
  AlertCircle,
} from "lucide-react"

interface MLAccount {
  id: string
  ml_user_id: string
  nickname: string
  token_expires_at: string
  connected: boolean
  tokenExpired: boolean
  browser_preference?: string
  auto_sync_stock?: boolean
  auto_sync_new_listings?: boolean
  last_stock_sync_at?: string
  last_new_listings_sync_at?: string
  stock_sync_count?: number
  new_listings_count?: number
  platform_code?: string | null
  empresa_id?: string | null
}

interface Empresa {
  id: string
  razon_social: string
  nombre_empresa?: string | null
}

export function MLAccountCard({
  account,
  onUpdate,
  onDelete,
  empresas = [],
}: {
  account: MLAccount
  onUpdate: () => void
  onDelete: () => void
  empresas?: Empresa[]
}) {
  const [isEditingNickname, setIsEditingNickname] = useState(false)
  const [nickname, setNickname] = useState(account.nickname || account.ml_user_id)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [browserPreference, setBrowserPreference] = useState("")
  const [customBrowser, setCustomBrowser] = useState("")
  const [isSavingBrowser, setIsSavingBrowser] = useState(false)
  const [authLinkCopied, setAuthLinkCopied] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<{ success: boolean; message: string } | null>(null)
  const [autoSyncStock, setAutoSyncStock] = useState(account.auto_sync_stock ?? true)
  const [autoSyncNewListings, setAutoSyncNewListings] = useState(account.auto_sync_new_listings ?? true)
  const [isSavingSync, setIsSavingSync] = useState(false)
  const [isSyncingStock, setIsSyncingStock] = useState(false)
  const [platformCode, setPlatformCode] = useState(account.platform_code ?? "")
  const [empresaId, setEmpresaId] = useState(account.empresa_id ?? "")
  const [isSavingLibral, setIsSavingLibral] = useState(false)
  const [libralSaveResult, setLibralSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleSaveLibralConfig = async () => {
    setIsSavingLibral(true)
    setLibralSaveResult(null)
    try {
      const res = await fetch(`/api/ml/accounts/${account.id}/libral-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_code: platformCode || null,
          empresa_id: empresaId || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setLibralSaveResult({ ok: true, msg: "Guardado" })
        onUpdate()
      } else {
        setLibralSaveResult({ ok: false, msg: data.error ?? "Error" })
      }
    } catch {
      setLibralSaveResult({ ok: false, msg: "Error de conexión" })
    } finally {
      setIsSavingLibral(false)
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem(`ml_browser_${account.id}`)
    if (stored) {
      const parsed = JSON.parse(stored)
      setBrowserPreference(parsed.value)
      if (parsed.value === "custom") {
        setCustomBrowser(parsed.custom || "")
      }
    }
  }, [account.id])

  const browserOptions = [
    { value: "chrome-default", label: "Chrome - Perfil Principal" },
    { value: "chrome-profile-1", label: "Chrome - Perfil 1" },
    { value: "chrome-profile-2", label: "Chrome - Perfil 2" },
    { value: "chrome-profile-3", label: "Chrome - Perfil 3" },
    { value: "chrome-incognito", label: "Chrome - Modo Incógnito" },
    { value: "firefox-default", label: "Firefox - Perfil Principal" },
    { value: "firefox-profile-1", label: "Firefox - Perfil 1" },
    { value: "firefox-profile-2", label: "Firefox - Perfil 2" },
    { value: "firefox-private", label: "Firefox - Ventana Privada" },
    { value: "edge-default", label: "Edge - Perfil Principal" },
    { value: "edge-profile-1", label: "Edge - Perfil 1" },
    { value: "safari-default", label: "Safari - Perfil Principal" },
    { value: "custom", label: "Personalizado..." },
  ]

  const handleSaveSyncPreferences = async () => {
    setIsSavingSync(true)
    try {
      const response = await fetch(`/api/mercadolibre/accounts/${account.id}/sync-preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_sync_stock: autoSyncStock,
          auto_sync_new_listings: autoSyncNewListings,
        }),
      })
      if (response.ok) {
        onUpdate()
      }
    } catch (error) {
      console.error("Error saving sync preferences:", error)
    } finally {
      setIsSavingSync(false)
    }
  }

  const handleSyncStockNow = async () => {
    setIsSyncingStock(true)
    try {
      const response = await fetch("/api/ml/sync-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: account.id }),
      })
      const data = await response.json()
      if (response.ok) {
        setLastSyncResult({
          success: true,
          message: `Stock sincronizado: ${data.updated || 0} actualizados`,
        })
        onUpdate()
      } else {
        setLastSyncResult({
          success: false,
          message: data.error || "Error al sincronizar stock",
        })
      }
    } catch (error) {
      setLastSyncResult({
        success: false,
        message: "Error de conexión",
      })
    } finally {
      setIsSyncingStock(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setLastSyncResult(null)
    try {
      const response = await fetch("/api/mercadolibre/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ml_user_id: account.ml_user_id }),
      })

      const data = await response.json()

      if (response.ok) {
        setLastSyncResult({
          success: true,
          message: `Sincronizado: ${data.summary?.orders || 0} ordenes, ${data.summary?.items || 0} productos`,
        })
      } else {
        setLastSyncResult({
          success: false,
          message: data.error || "Error al sincronizar",
        })
      }
    } catch (error) {
      setLastSyncResult({
        success: false,
        message: "Error de conexion",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleSaveNickname = async () => {
    try {
      const response = await fetch(`/api/mercadolibre/accounts/${account.id}/nickname`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      })

      if (response.ok) {
        setIsEditingNickname(false)
        onUpdate()
      }
    } catch (error) {
      console.error("Error updating nickname:", error)
    }
  }

  const handleSaveBrowserPreference = async () => {
    setIsSavingBrowser(true)
    try {
      const finalBrowserPreference = browserPreference === "custom" ? customBrowser : browserPreference

      // Save to localStorage
      localStorage.setItem(
        `ml_browser_${account.id}`,
        JSON.stringify({
          value: browserPreference,
          custom: browserPreference === "custom" ? customBrowser : "",
          label: finalBrowserPreference,
        }),
      )

      console.log("Browser preference saved to localStorage:", finalBrowserPreference)
      alert("Navegador preferido guardado correctamente")
    } catch (error) {
      console.error("Error saving browser preference:", error)
      alert("Error al guardar el navegador preferido")
    } finally {
      setIsSavingBrowser(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`¿Estás seguro de eliminar la cuenta ${nickname}?`)) return

    setIsDeleting(true)
    try {
      const response = await fetch("/api/mercadolibre/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      })

      if (response.ok) {
        onDelete()
      }
    } catch (error) {
      console.error("Error deleting account:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  const copyWebhookUrl = () => {
    const url = `${window.location.origin}/api/mercadolibre/webhooks?account_id=${account.id}`
    navigator.clipboard.writeText(url)
    setWebhookUrl(url)
  }

  const copyAuthLink = () => {
    const authLink = `${window.location.origin}/api/mercadolibre/auth`
    navigator.clipboard.writeText(authLink)
    setAuthLinkCopied(true)
  }

  const isConnected = account.connected && !account.tokenExpired

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" />
              </svg>
            </div>
            <div className="flex-1">
              {isEditingNickname ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="h-8 max-w-[200px]"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveNickname}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setNickname(account.nickname || account.ml_user_id)
                      setIsEditingNickname(false)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">{nickname}</CardTitle>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditingNickname(true)}>
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
              <CardDescription className="text-xs">ID: {account.ml_user_id}</CardDescription>
            </div>
          </div>
          <Badge variant={isConnected ? "default" : "destructive"} className="gap-1">
            {isConnected ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Conectada
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                {account.tokenExpired ? "Token Expirado" : "Desconectada"}
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`browser-${account.id}`} className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Navegador Preferido
          </Label>
          <div className="space-y-2">
            <Select value={browserPreference} onValueChange={setBrowserPreference}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un navegador o perfil" />
              </SelectTrigger>
              <SelectContent>
                {browserOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {browserPreference === "custom" && (
              <Input
                value={customBrowser}
                onChange={(e) => setCustomBrowser(e.target.value)}
                placeholder="Ej: Chrome Perfil Trabajo, Brave, Opera"
                className="w-full"
              />
            )}

            <Button onClick={handleSaveBrowserPreference} disabled={isSavingBrowser} className="w-full">
              {isSavingBrowser ? "Guardando..." : "Guardar Navegador Preferido"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Selecciona qué navegador o perfil usar para abrir órdenes de esta cuenta. Esta información se mostrará
            cuando intentes abrir una orden.
          </p>
        </div>

        {/* Configuración de Sincronización Automática */}
        <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
          <Label className="text-sm font-medium">Sincronización Automática</Label>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Actualizar stock en ML</Label>
              <p className="text-xs text-muted-foreground">Después de importar stock de proveedores</p>
            </div>
            <input
              type="checkbox"
              checked={autoSyncStock}
              onChange={(e) => setAutoSyncStock(e.target.checked)}
              className="h-4 w-4"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Publicar productos nuevos</Label>
              <p className="text-xs text-muted-foreground">Después de importar catálogo nuevo</p>
            </div>
            <input
              type="checkbox"
              checked={autoSyncNewListings}
              onChange={(e) => setAutoSyncNewListings(e.target.checked)}
              className="h-4 w-4"
            />
          </div>

          <Button onClick={handleSaveSyncPreferences} disabled={isSavingSync} size="sm" className="w-full">
            {isSavingSync ? "Guardando..." : "Guardar preferencias"}
          </Button>

          {/* Estado de última sincronización */}
          <div className="pt-2 border-t border-border space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Último sync stock:</span>
              <span>
                {account.last_stock_sync_at
                  ? new Date(account.last_stock_sync_at).toLocaleString("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "Nunca"}
              </span>
            </div>
            {account.stock_sync_count !== undefined && account.stock_sync_count > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Productos actualizados:</span>
                <span>{account.stock_sync_count}</span>
              </div>
            )}
          </div>

          <Button
            onClick={handleSyncStockNow}
            disabled={isSyncingStock || !isConnected}
            variant="outline"
            size="sm"
            className="w-full bg-transparent"
          >
            {isSyncingStock ? "Sincronizando..." : "Sincronizar stock ahora"}
          </Button>
        </div>

        {/* Configuración Libral */}
        <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
          <Label className="text-sm font-medium">Configuración Libral</Label>

          {(!account.platform_code || !account.empresa_id) && (
            <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                {!account.platform_code && !account.empresa_id
                  ? "Falta platform code y empresa"
                  : !account.platform_code
                    ? "Falta platform code"
                    : "Falta empresa asociada"}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Platform Code</Label>
              <Select value={platformCode} onValueChange={setPlatformCode}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  <SelectItem value="C1">C1</SelectItem>
                  <SelectItem value="C2">C2</SelectItem>
                  <SelectItem value="C3">C3</SelectItem>
                  <SelectItem value="C4">C4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Empresa</Label>
              <Select value={empresaId} onValueChange={setEmpresaId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Seleccionar empresa..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nombre_empresa || e.razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSaveLibralConfig} disabled={isSavingLibral} size="sm" className="w-full">
              {isSavingLibral ? "Guardando..." : "Guardar config Libral"}
            </Button>
            {libralSaveResult && (
              <p className={`text-xs ${libralSaveResult.ok ? "text-green-600" : "text-red-600"}`}>
                {libralSaveResult.msg}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Dialog open={showConfig} onOpenChange={setShowConfig}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1 bg-transparent">
                <Settings className="h-4 w-4" />
                <span className="ml-2">Webhooks</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Configuración de {nickname}</DialogTitle>
                <DialogDescription>Configura webhooks para esta cuenta</DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>URL del Webhook</Label>
                  <div className="flex gap-2">
                    <Input
                      value={
                        webhookUrl || `${window.location.origin}/api/mercadolibre/webhooks?account_id=${account.id}`
                      }
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button onClick={copyWebhookUrl} variant="outline">
                      Copiar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Configura esta URL en tu aplicación de MercadoLibre para recibir notificaciones en tiempo real
                  </p>
                </div>

                <Alert>
                  <AlertDescription className="text-sm">
                    <strong>Pasos para configurar:</strong>
                    <ol className="mt-2 ml-4 list-decimal space-y-1">
                      <li>Ve a developers.mercadolibre.com</li>
                      <li>Edita tu aplicación</li>
                      <li>Pega la URL del webhook en "Notifications Callback URL"</li>
                      <li>Selecciona los topics: orders_v2, shipments, items</li>
                    </ol>
                  </AlertDescription>
                </Alert>

                <div className="flex justify-between">
                  <Button variant="outline" asChild>
                    <a href="https://developers.mercadolibre.com.ar" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      <span className="ml-2">Ir a Developers</span>
                    </a>
                  </Button>
                  <Button onClick={() => setShowConfig(false)}>Cerrar</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {!isConnected && (
            <Button variant="default" asChild className="flex-1">
              <a href={`/api/mercadolibre/auth?account_id=${account.id}`}>
                {account.tokenExpired ? "Reconectar" : "Conectar"}
              </a>
            </Button>
          )}

          {isConnected && (
            <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing} className="bg-transparent">
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              <span className="ml-1">{isSyncing ? "Sincronizando..." : "Sincronizar"}</span>
            </Button>
          )}

          <Button variant="destructive" size="icon" onClick={handleDelete} disabled={isDeleting}>
            <Trash className="h-4 w-4" />
          </Button>
        </div>

        {account.tokenExpired && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">
              El token ha expirado. Haz clic en Reconectar para renovar la conexion.
            </AlertDescription>
          </Alert>
        )}

        {lastSyncResult && (
          <Alert variant={lastSyncResult.success ? "default" : "destructive"}>
            <AlertDescription className="text-xs">{lastSyncResult.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
