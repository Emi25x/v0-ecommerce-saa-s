"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Package as PackageIcon, ExternalLink as ExternalLinkIcon, CheckCircle2 as CheckCircleIcon } from "lucide-react"

export default function DashboardPage() {
  const [mlAccounts, setMlAccounts] = useState<any[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<any>(null)
  const [statsData, setStatsData] = useState<any>(null)

  // Fetch ML accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch("/api/mercadolibre/accounts", { cache: "no-store" })
        if (!res.ok) {
          setMlAccounts([])
          return
        }

        const json = await res.json()
        const accounts = Array.isArray(json) ? json : (json.accounts ?? json.data ?? [])
        setMlAccounts(accounts.filter((acc: any) => acc.connected))

        // Auto-select first connected account
        if (accounts.length > 0 && !selectedAccountId) {
          const firstConnected = accounts.find((acc: any) => acc.connected)
          if (firstConnected) {
            setSelectedAccountId(firstConnected.id)
          }
        }
      } catch (error) {
        console.error("[v0] Failed to fetch accounts:", error)
        setMlAccounts([])
      } finally {
        setAccountsLoading(false)
      }
    }
    fetchAccounts()
  }, [])

  // Fetch import status and stats when account selected
  useEffect(() => {
    if (!selectedAccountId) return

    const fetchData = async () => {
      try {
        const [statusRes, statsRes] = await Promise.all([
          fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`),
          fetch(`/api/debug/import-queue-stats?account_id=${selectedAccountId}`),
        ])

        if (statusRes.ok) {
          const status = await statusRes.json()
          setImportStatus(status)
        }

        if (statsRes.ok) {
          const stats = await statsRes.json()
          setStatsData(stats)
        }
      } catch (error) {
        console.error("[v0] Failed to fetch data:", error)
      }
    }

    fetchData()
  }, [selectedAccountId])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "idle":
        return <Badge variant="outline">No iniciada</Badge>
      case "running":
        return <Badge className="bg-blue-500">En progreso</Badge>
      case "paused":
        return <Badge className="bg-yellow-500">Pausada</Badge>
      case "completed":
        return <Badge className="bg-green-500">Completada</Badge>
      case "error":
        return <Badge className="bg-red-500">Error</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const importProgress =
    importStatus?.publications_total && importStatus.publications_offset
      ? Math.round((importStatus.publications_offset / importStatus.publications_total) * 100)
      : 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="flex h-16 items-center px-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* Cuentas ML */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageIcon className="h-5 w-5" />
              Cuentas de MercadoLibre
            </CardTitle>
            <CardDescription>
              {accountsLoading ? "Cargando..." : `${mlAccounts.length} cuenta(s) conectada(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {accountsLoading ? (
              <p className="text-sm text-muted-foreground">Cargando cuentas...</p>
            ) : mlAccounts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-4">No hay cuentas de MercadoLibre conectadas</p>
                <Button asChild>
                  <Link href="/settings/accounts">Conectar cuenta</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {mlAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{account.nickname}</p>
                      <p className="text-sm text-muted-foreground">ML User: {account.ml_user_id}</p>
                    </div>
                    <Badge variant="outline" className="bg-green-50 text-green-700">
                      <CheckCircleIcon className="h-3 w-3 mr-1" />
                      Conectada
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Importación Inicial */}
        {mlAccounts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Importación Inicial de Publicaciones</CardTitle>
              <CardDescription>
                Importa todas tus publicaciones de MercadoLibre y vincúlalas con tu catálogo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {importStatus && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Estado</span>
                    {getStatusBadge(importStatus.status)}
                  </div>

                  {importStatus.status !== "idle" && importStatus.publications_total && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Progreso</span>
                          <span className="text-sm text-muted-foreground">
                            {importStatus.publications_offset} / {importStatus.publications_total}
                          </span>
                        </div>
                        <Progress value={importProgress} className="h-2" />
                      </div>
                    </>
                  )}

                  {statsData && (
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div>
                        <p className="text-sm text-muted-foreground">Importadas</p>
                        <p className="text-2xl font-bold">{statsData.total_publications || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Vinculadas</p>
                        <p className="text-2xl font-bold text-green-600">{statsData.matched_publications || 0}</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              <Button asChild className="w-full" size="lg">
                <Link href="/ml/importer">
                  Abrir Importación Inicial
                  <ExternalLinkIcon className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Links rápidos */}
        {mlAccounts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Publicaciones</CardTitle>
                <CardDescription>Ver todas las publicaciones importadas</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full bg-transparent">
                  <Link href="/ml/publications">Ir a Publicaciones</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sin Producto</CardTitle>
                <CardDescription>Publicaciones sin vincular</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full bg-transparent">
                  <Link href="/ml/unmatched">Ver Sin Vincular</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuración</CardTitle>
                <CardDescription>Gestionar cuentas y plantillas</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full bg-transparent">
                  <Link href="/settings/accounts">Ir a Configuración</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
