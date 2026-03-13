"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { PLATFORMS, CATEGORY_LABELS } from "@/lib/marketing/platforms"
import type { PlatformDefinition, MarketingConnection } from "@/types/marketing"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS marketing_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT UNIQUE NOT NULL,
  account_id TEXT,
  account_name TEXT,
  credentials JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Nunca"
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return "Hace un momento"
  if (mins < 60) return `Hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Hace ${hrs}h`
  return `Hace ${Math.floor(hrs / 24)}d`
}

function PlatformCard({
  platform,
  connection,
  onSave,
  onDisconnect,
}: {
  platform: PlatformDefinition
  connection: MarketingConnection | null
  onSave: (platform: string, credentials: Record<string, string>) => Promise<void>
  onDisconnect: (id: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showSql, setShowSql] = useState(false)
  const isConnected = !!connection

  function handleFieldChange(key: string, value: string) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(platform.id, fields)
      setExpanded(false)
      setFields({})
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    if (!connection) return
    if (!confirm(`¿Desconectar ${platform.name}? Se eliminarán las credenciales guardadas.`)) return
    await onDisconnect(connection.id)
  }

  function handleOAuth() {
    window.location.href = `/api/marketing/oauth/${platform.id}`
  }

  return (
    <Card className={`transition-all ${isConnected ? "border-green-200" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${platform.color}20` }}
            >
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: platform.color }} />
            </div>
            <div>
              <CardTitle className="text-base">{platform.name}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{platform.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="outline" className="text-xs capitalize hidden sm:inline-flex">
              {CATEGORY_LABELS[platform.category]}
            </Badge>
            {isConnected ? (
              <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <path d="M22 4 12 14.01l-3-3" />
                </svg>
                Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Sin conectar
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Connected state */}
        {isConnected && !expanded && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {platform.capabilities.map(cap => (
                <Badge key={cap} variant="secondary" className="text-xs capitalize">
                  {cap.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
            {connection.account_name && (
              <p className="text-sm text-muted-foreground">Cuenta: <span className="font-medium text-foreground">{connection.account_name}</span></p>
            )}
            <p className="text-xs text-muted-foreground">Última sincronización: {timeAgo(connection.last_synced_at)}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setExpanded(true)}>
                <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Actualizar credenciales
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDisconnect}>
                <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
                Desconectar
              </Button>
            </div>
          </div>
        )}

        {/* Not connected or editing */}
        {(!isConnected || expanded) && (
          <div className="space-y-4">
            {expanded && (
              <div className="flex items-center justify-between pb-2 border-b">
                <p className="text-sm font-medium">Actualizar credenciales</p>
                <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </Button>
              </div>
            )}

            {platform.auth_type === "oauth" ? (
              <div className="space-y-3">
                {platform.fields.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Primero ingresa tus credenciales de la aplicación, luego autoriza con OAuth:
                    </p>
                    {platform.fields.map(field => (
                      <div key={field.key}>
                        <Label htmlFor={`${platform.id}-${field.key}`} className="text-sm">
                          {field.label}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <Input
                          id={`${platform.id}-${field.key}`}
                          type={field.type}
                          placeholder={field.placeholder}
                          value={fields[field.key] ?? ""}
                          onChange={e => handleFieldChange(field.key, e.target.value)}
                          className="mt-1"
                        />
                        {field.help && (
                          <p className="text-xs text-muted-foreground mt-0.5">{field.help}</p>
                        )}
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full"
                    >
                      {saving ? (
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                      ) : null}
                      Guardar credenciales
                    </Button>
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={handleOAuth}
                  style={{ backgroundColor: platform.color, color: "white", borderColor: platform.color }}
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  Autorizar con OAuth → {platform.name}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {platform.fields.map(field => (
                  <div key={field.key}>
                    <Label htmlFor={`${platform.id}-${field.key}`} className="text-sm">
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Input
                      id={`${platform.id}-${field.key}`}
                      type={field.type}
                      placeholder={field.placeholder}
                      value={fields[field.key] ?? ""}
                      onChange={e => handleFieldChange(field.key, e.target.value)}
                      className="mt-1"
                    />
                    {field.help && (
                      <p className="text-xs text-muted-foreground mt-0.5">{field.help}</p>
                    )}
                  </div>
                ))}
                <Button
                  className="w-full"
                  onClick={handleSave}
                  disabled={saving}
                  style={{ backgroundColor: platform.color, color: "white", borderColor: platform.color }}
                >
                  {saving ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  )}
                  {isConnected ? "Actualizar" : "Conectar"} {platform.name}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ConfigPageContent() {
  const [connections, setConnections] = useState<MarketingConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [sqlCopied, setSqlCopied] = useState(false)
  const [showSqlBanner, setShowSqlBanner] = useState(true)
  const { toast } = useToast()
  const searchParams = useSearchParams()

  useEffect(() => {
    fetchConnections()
    // Handle OAuth callback params
    const connected = searchParams.get("connected")
    const error = searchParams.get("error")
    const platform = searchParams.get("platform")

    if (connected) {
      toast({ title: `${connected} conectado exitosamente`, description: "Las credenciales OAuth han sido guardadas." })
    }
    if (error) {
      toast({ title: `Error al conectar ${platform ?? ""}`, description: decodeURIComponent(error), variant: "destructive" })
    }
  }, [])

  async function fetchConnections() {
    try {
      const res = await fetch("/api/marketing/connections")
      const data = await res.json()
      setConnections(data.connections ?? [])
    } catch {
      toast({ title: "Error al cargar conexiones", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(platform: string, credentials: Record<string, string>) {
    try {
      const res = await fetch("/api/marketing/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, credentials }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast({ title: `${platform} guardado`, description: "Credenciales almacenadas correctamente." })
      await fetchConnections()
    } catch (e: any) {
      toast({ title: "Error al guardar", description: e.message, variant: "destructive" })
      throw e
    }
  }

  async function handleDisconnect(id: string) {
    try {
      const res = await fetch(`/api/marketing/connections/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Error al desconectar")
      toast({ title: "Plataforma desconectada" })
      await fetchConnections()
    } catch (e: any) {
      toast({ title: "Error al desconectar", description: e.message, variant: "destructive" })
    }
  }

  function copySql() {
    navigator.clipboard.writeText(CREATE_TABLE_SQL)
    setSqlCopied(true)
    setTimeout(() => setSqlCopied(false), 2000)
  }

  const connectionMap = new Map(connections.map(c => [c.platform, c]))
  const connectedCount = connections.length

  const CATEGORIES = [
    { key: "search", platforms: PLATFORMS.filter(p => p.category === "search") },
    { key: "ecommerce", platforms: PLATFORMS.filter(p => p.category === "ecommerce") },
    { key: "social", platforms: PLATFORMS.filter(p => p.category === "social") },
    { key: "email", platforms: PLATFORMS.filter(p => p.category === "email") },
    { key: "crm", platforms: PLATFORMS.filter(p => p.category === "crm") },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/marketing">
                <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Marketing
              </Link>
            </Button>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-2xl font-bold">Configuración de Plataformas</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{connectedCount} / {PLATFORMS.length} conectadas</Badge>
          </div>
        </div>

        {/* SQL Banner */}
        {showSqlBanner && (
          <Card className="mb-6 border-amber-200 bg-amber-50/80">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-amber-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span className="font-medium text-amber-800">Migración de Base de Datos Requerida</span>
                  </div>
                  <p className="text-sm text-amber-700 mb-3">
                    Ejecuta este SQL en Supabase → SQL Editor para crear la tabla <code className="font-mono bg-amber-100 px-1 rounded">marketing_connections</code>:
                  </p>
                  <pre className="text-xs bg-amber-100 border border-amber-200 rounded p-3 overflow-x-auto font-mono text-amber-900 whitespace-pre">
{CREATE_TABLE_SQL}
                  </pre>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={copySql} className="border-amber-300">
                    {sqlCopied ? (
                      <>
                        <svg className="w-3 h-3 mr-1 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <path d="M22 4 12 14.01l-3-3" />
                        </svg>
                        Copiado
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Copiar SQL
                      </>
                    )}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowSqlBanner(false)} className="text-amber-700">
                    Ocultar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i}>
                <div className="h-5 w-32 bg-muted rounded mb-3 animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map(j => (
                    <Card key={j}>
                      <CardContent className="pt-6">
                        <div className="h-5 w-36 bg-muted rounded mb-3 animate-pulse" />
                        <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {CATEGORIES.map(({ key, platforms }) => (
              <div key={key}>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold">{CATEGORY_LABELS[key]}</h2>
                  <Badge variant="secondary" className="text-xs">
                    {platforms.filter(p => connectionMap.has(p.id)).length}/{platforms.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {platforms.map(platform => (
                    <PlatformCard
                      key={platform.id}
                      platform={platform}
                      connection={connectionMap.get(platform.id) ?? null}
                      onSave={handleSave}
                      onDisconnect={handleDisconnect}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MarketingConfigPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ConfigPageContent />
    </Suspense>
  )
}
