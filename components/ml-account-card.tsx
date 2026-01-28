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

const CheckCircle = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
)

const XCircle = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
)

const Settings = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const Trash = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
)

const Edit = () => (
  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
    />
  </svg>
)

const Check = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const X = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const ExternalLink = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
)

const Globe = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
    />
  </svg>
)

interface MLAccount {
  id: string
  ml_user_id: string
  nickname: string
  token_expires_at: string
  connected: boolean
  tokenExpired: boolean
  browser_preference?: string
}

export function MLAccountCard({
  account,
  onUpdate,
  onDelete,
}: { account: MLAccount; onUpdate: () => void; onDelete: () => void }) {
  const [isEditingNickname, setIsEditingNickname] = useState(false)
  const [nickname, setNickname] = useState(account.nickname || account.ml_user_id)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [browserPreference, setBrowserPreference] = useState("")
  const [customBrowser, setCustomBrowser] = useState("")
  const [isSavingBrowser, setIsSavingBrowser] = useState(false)
  const [authLinkCopied, setAuthLinkCopied] = useState(false)

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
      console.error("[v0] Error updating nickname:", error)
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

      console.log("[v0] Browser preference saved to localStorage:", finalBrowserPreference)
      alert("Navegador preferido guardado correctamente")
    } catch (error) {
      console.error("[v0] Error saving browser preference:", error)
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
      console.error("[v0] Error deleting account:", error)
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
                    <Check />
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
                    <X />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">{nickname}</CardTitle>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditingNickname(true)}>
                    <Edit />
                  </Button>
                </div>
              )}
              <CardDescription className="text-xs">ID: {account.ml_user_id}</CardDescription>
            </div>
          </div>
          <Badge variant={isConnected ? "default" : "destructive"} className="gap-1">
            {isConnected ? (
              <>
                <CheckCircle />
                Conectada
              </>
            ) : (
              <>
                <XCircle />
                {account.tokenExpired ? "Token Expirado" : "Desconectada"}
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`browser-${account.id}`} className="text-sm font-medium flex items-center gap-2">
            <Globe />
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

        <div className="flex gap-2">
          <Dialog open={showConfig} onOpenChange={setShowConfig}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1 bg-transparent">
                <Settings />
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
                      <ExternalLink />
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

          <Button variant="destructive" size="icon" onClick={handleDelete} disabled={isDeleting}>
            <Trash />
          </Button>
        </div>

        {account.tokenExpired && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">
              El token ha expirado. Haz clic en "Reconectar" para renovar la conexión.
            </AlertDescription>
          </Alert>
        )}

        </CardContent>
    </Card>
  )
}
