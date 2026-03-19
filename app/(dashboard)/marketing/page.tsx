"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { PLATFORMS, CATEGORY_LABELS } from "@/domains/marketing/platforms"
import type { PlatformDefinition } from "@/types/marketing"
import Link from "next/link"

interface Connection {
  id: string
  platform: string
  account_name: string | null
  is_active: boolean
  last_synced_at: string | null
}

const PLATFORM_ROUTES: Record<string, string> = {
  google_ads: "/marketing/google",
  google_analytics: "/marketing/google",
  google_search_console: "/marketing/google",
  google_merchant: "/marketing/google",
  meta_ads: "/marketing/meta",
  tiktok_ads: "/marketing/tiktok",
  linkedin_ads: "/marketing/config",
  pinterest_ads: "/marketing/config",
  klaviyo: "/marketing/email",
  mailchimp: "/marketing/email",
  brevo: "/marketing/email",
  hubspot: "/marketing/email",
  activecampaign: "/marketing/email",
  whatsapp: "/marketing/email",
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
}

function formatNumber(value: number) {
  return value.toLocaleString("es-AR")
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Nunca"
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `Hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Hace ${hrs}h`
  return `Hace ${Math.floor(hrs / 24)}d`
}

export default function MarketingPage() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchConnections()
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

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch("/api/marketing/sync", { method: "POST" })
      const data = await res.json()
      toast({ title: `Sincronización completada`, description: `${data.synced} plataformas actualizadas` })
      fetchConnections()
    } catch {
      toast({ title: "Error al sincronizar", variant: "destructive" })
    } finally {
      setSyncing(false)
    }
  }

  const connectedPlatforms = new Set(connections.map((c) => c.platform))
  const connectedList = PLATFORMS.filter((p) => connectedPlatforms.has(p.id))
  const availableList = PLATFORMS.filter((p) => !connectedPlatforms.has(p.id))

  const totalConnected = connectedList.length

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
            <p className="text-muted-foreground mt-1">
              Gestiona todas tus integraciones de marketing desde un solo lugar
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href="/marketing/config">
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.07 4.93A9.956 9.956 0 0 0 12 2a9.956 9.956 0 0 0-7.07 2.93M4.93 4.93A9.956 9.956 0 0 0 2 12a9.956 9.956 0 0 0 2.93 7.07M19.07 19.07A9.956 9.956 0 0 0 22 12a9.956 9.956 0 0 0-2.93-7.07M4.93 19.07A9.956 9.956 0 0 0 12 22a9.956 9.956 0 0 0 7.07-2.93" />
                </svg>
                Configurar
              </Link>
            </Button>
            <Button onClick={handleSync} disabled={syncing || totalConnected === 0}>
              {syncing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              )}
              Sincronizar Todo
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{totalConnected}</div>
              <p className="text-sm text-muted-foreground">Plataformas Conectadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{PLATFORMS.length - totalConnected}</div>
              <p className="text-sm text-muted-foreground">Disponibles</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{connections.filter((c) => c.last_synced_at).length}</div>
              <p className="text-sm text-muted-foreground">Sincronizadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{PLATFORMS.length}</div>
              <p className="text-sm text-muted-foreground">Total Soportadas</p>
            </CardContent>
          </Card>
        </div>

        {/* Connected Platforms */}
        {loading ? (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Plataformas Conectadas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <Skeleton className="h-6 w-32 mb-2" />
                    <Skeleton className="h-4 w-24 mb-4" />
                    <Skeleton className="h-8 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : connectedList.length > 0 ? (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">
              Plataformas Conectadas
              <Badge variant="secondary" className="ml-2">
                {connectedList.length}
              </Badge>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectedList.map((platform) => {
                const conn = connections.find((c) => c.platform === platform.id)
                const route = PLATFORM_ROUTES[platform.id] ?? "/marketing/config"
                return (
                  <Card key={platform.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: platform.color }}
                          />
                          <CardTitle className="text-base">{platform.name}</CardTitle>
                        </div>
                        <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                          <svg
                            className="w-3 h-3 mr-1"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <path d="M22 4 12 14.01l-3-3" />
                          </svg>
                          Conectado
                        </Badge>
                      </div>
                      {conn?.account_name && <p className="text-sm text-muted-foreground">{conn.account_name}</p>}
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {platform.capabilities.slice(0, 3).map((cap) => (
                          <Badge key={cap} variant="secondary" className="text-xs capitalize">
                            {cap.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground mb-3">
                        Última sync: {timeAgo(conn?.last_synced_at ?? null)}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" asChild className="flex-1">
                          <Link href={route}>Ver detalle</Link>
                        </Button>
                        <Button size="sm" variant="ghost" asChild>
                          <Link href="/marketing/config">
                            <svg
                              className="w-4 h-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.07 4.93A9.956 9.956 0 0 0 12 2a9.956 9.956 0 0 0-7.07 2.93M4.93 4.93A9.956 9.956 0 0 0 2 12a9.956 9.956 0 0 0 2.93 7.07M19.07 19.07A9.956 9.956 0 0 0 22 12a9.956 9.956 0 0 0-2.93-7.07M4.93 19.07A9.956 9.956 0 0 0 12 22a9.956 9.956 0 0 0 7.07-2.93" />
                            </svg>
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* Available Platforms by Category */}
        {availableList.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">
              Plataformas Disponibles
              <Badge variant="secondary" className="ml-2">
                {availableList.length}
              </Badge>
            </h2>
            {(["search", "social", "email", "crm", "ecommerce"] as const).map((category) => {
              const categoryPlatforms = availableList.filter((p) => p.category === category)
              if (categoryPlatforms.length === 0) return null
              return (
                <div key={category} className="mb-6">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categoryPlatforms.map((platform) => (
                      <Card key={platform.id} className="hover:shadow-md transition-shadow border-dashed">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: platform.color }}
                            />
                            <CardTitle className="text-base">{platform.name}</CardTitle>
                          </div>
                          <CardDescription className="text-sm">{platform.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-1 mb-3">
                            <Badge variant="outline" className="text-xs capitalize">
                              {CATEGORY_LABELS[platform.category]}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {platform.auth_type === "oauth" ? "OAuth" : "API Key"}
                            </Badge>
                          </div>
                          <Button size="sm" className="w-full" asChild>
                            <Link href="/marketing/config">
                              <svg
                                className="w-4 h-4 mr-2"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                              Conectar
                            </Link>
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
