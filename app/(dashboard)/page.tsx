"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/layout/page-header"
import {
  Package,
  Database,
  ShoppingCart,
  Truck,
  ArrowRight,
  Activity,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"

// ── Types ──

interface SystemStats {
  total_products: number
  with_stock: number
  without_ean: number
  pending_publish: number
}

interface MlStats {
  total_published: number
  active: number
  paused: number
  sold: number
}

interface Provider {
  name: string
  is_active: boolean
  last_run: string | null
  last_status: string | null
  products_count: number
  stock_total: number
}

interface OpsStatus {
  providers: Provider[]
  system_stats: SystemStats
  ml_stats: MlStats
}

interface ProcessRun {
  process_type: string
  process_name: string
  status: string
  started_at: string
  duration_ms: number | null
  rows_processed: number | null
  rows_updated: number | null
  rows_failed: number | null
  error_message: string | null
}

// ── Dashboard ──

export default function DashboardPage() {
  const [ops, setOps] = useState<OpsStatus | null>(null)
  const [recentRuns, setRecentRuns] = useState<ProcessRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [opsRes, runsRes] = await Promise.all([
          fetch("/api/ops/status"),
          fetch("/api/ops/recent-runs").catch(() => null),
        ])

        if (opsRes.ok) setOps(await opsRes.json())
        if (runsRes?.ok) {
          const data = await runsRes.json()
          setRecentRuns(Array.isArray(data) ? data : data.runs ?? [])
        }
      } catch {
        // Non-critical — dashboard shows empty state
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="min-h-full bg-background">
      <PageHeader title="Dashboard" description="Resumen general de tu operación" />

      <div className="space-y-6 p-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Productos"
            value={ops?.system_stats.total_products}
            icon={Package}
            loading={loading}
            href="/inventory"
          />
          <KpiCard
            title="Con stock"
            value={ops?.system_stats.with_stock}
            icon={Database}
            loading={loading}
            href="/inventory/stock"
            detail={
              ops ? `${Math.round((ops.system_stats.with_stock / Math.max(ops.system_stats.total_products, 1)) * 100)}%` : undefined
            }
          />
          <KpiCard
            title="Publicaciones ML"
            value={ops?.ml_stats.total_published}
            icon={ShoppingCart}
            loading={loading}
            href="/ml/publications"
            detail={ops?.ml_stats.active ? `${ops.ml_stats.active} activas` : undefined}
          />
          <KpiCard
            title="Pendientes publicar"
            value={ops?.system_stats.pending_publish}
            icon={Truck}
            loading={loading}
            href="/ml/priorities"
          />
        </div>

        {/* Two columns: Providers + Quick Actions */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Providers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" />
                Proveedores
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : ops?.providers?.length ? (
                <div className="space-y-3">
                  {ops.providers.map((p) => (
                    <div key={p.name} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.products_count.toLocaleString()} productos &middot; stock: {p.stock_total.toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.last_status === "completed" ? (
                          <Badge variant="outline" className="gap-1 border-green-500/30 text-green-500">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </Badge>
                        ) : p.last_status === "failed" ? (
                          <Badge variant="outline" className="gap-1 border-red-500/30 text-red-500">
                            <AlertCircle className="h-3 w-3" /> Error
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            {p.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Sin proveedores configurados
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acciones rápidas</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <QuickAction href="/inventory" label="Ver inventario" />
              <QuickAction href="/ml/publications" label="Publicaciones ML" />
              <QuickAction href="/shopify/config" label="Exportar a Shopify" />
              <QuickAction href="/envios" label="Panel de envíos" />
              <QuickAction href="/billing" label="Facturación" />
              <QuickAction href="/integrations" label="Integraciones" />
            </CardContent>
          </Card>
        </div>

        {/* Recent activity */}
        {recentRuns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actividad reciente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentRuns.slice(0, 8).map((run, i) => (
                  <div key={`${run.process_type}-${run.started_at}-${i}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{run.process_name || run.process_type}</span>
                      {run.rows_processed != null && (
                        <span className="ml-2 text-muted-foreground">
                          {run.rows_processed.toLocaleString()} filas
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {run.duration_ms != null && (
                        <span className="text-xs text-muted-foreground">
                          {(run.duration_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={
                          run.status === "completed"
                            ? "border-green-500/30 text-green-500"
                            : run.status === "failed"
                            ? "border-red-500/30 text-red-500"
                            : "border-blue-500/30 text-blue-500"
                        }
                      >
                        {run.status === "completed" ? "OK" : run.status === "failed" ? "Error" : run.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──

function KpiCard({
  title,
  value,
  icon: Icon,
  loading,
  href,
  detail,
}: {
  title: string
  value?: number
  icon: React.ComponentType<{ className?: string }>
  loading: boolean
  href: string
  detail?: string
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-20" />
            ) : (
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold">{(value ?? 0).toLocaleString()}</p>
                {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" className="justify-between bg-transparent">
      <Link href={href}>
        {label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  )
}
