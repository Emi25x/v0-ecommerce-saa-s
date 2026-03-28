"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ShoppingBag,
  Package,
  Database,
  Truck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  ArrowRight,
  Loader2,
  RefreshCw,
  Ban,
  ExternalLink,
  AlertCircle,
} from "lucide-react"

interface DashboardData {
  sales: { last_24h: number; pending_export: number; export_blocked: number; failed: number; sent_today: number }
  stock: { products_with_stock: number; products_total: number; sources_active: number }
  libral_exports: { today: number; exports: any[] }
  sources: Array<{
    source_id: string; source_name: string; source_key: string | null; feed_type: string | null
    status: string
    schedule: { enabled: boolean; frequency: string; hour: number; minute: number; timezone: string; last_run_at: string | null; next_run_at: string | null } | null
    last_run: { status: string; started_at: string; duration_ms: number; rows_processed: number; rows_updated: number; rows_failed: number; error: string | null } | null
    hours_since_run: number | null
    diagnosis: string | null; suggestion: string | null
  }>
  accounts: { ml: any[]; shopify: any[]; ml_total: number; shopify_total: number; ml_missing_config: number; shopify_missing_config: number; ml_expired: number }
  catalog: { ml_publications: number; ml_no_sku: number }
  alerts: Array<{ type: string; message: string; href: string; severity: "error" | "warning" | "info" }>
  logs: Array<{ id: string; type: string; name: string; status: string; started_at: string; duration_ms: number; processed: number; updated: number; failed: number; error: string | null }>
}

const STATUS_COLORS: Record<string, string> = {
  ok: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  delayed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  never_run: "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400",
  disabled: "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-500",
}

const STATUS_LABELS: Record<string, string> = { ok: "OK", delayed: "Retrasada", error: "Error", never_run: "Sin ejecutar", disabled: "Deshabilitada" }

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchStats() {
    setLoading(true)
    try {
      const res = await fetch("/api/dashboard/stats")
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStats() }, [])

  const fmt = (n: number) => n.toLocaleString("es-AR")
  const timeAgo = (d: string | null) => {
    if (!d) return "Nunca"
    const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000)
    if (mins < 60) return `hace ${mins}min`
    if (mins < 1440) return `hace ${Math.round(mins / 60)}h`
    return `hace ${Math.round(mins / 1440)}d`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) return <div className="p-6 text-muted-foreground">Error cargando dashboard</div>

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Centro de Control</h1>
          <p className="text-sm text-muted-foreground">Estado operativo del sistema</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} className="gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </Button>
      </div>

      {/* ── ALERTAS ────────────────────────────────────────────────────────────── */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, i) => (
            <Link key={i} href={alert.href}>
              <div className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm cursor-pointer transition-colors ${
                alert.severity === "error"
                  ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30"
                  : "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
              }`}>
                {alert.severity === "error" ? <XCircle className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
                <span className="flex-1">{alert.message}</span>
                <ArrowRight className="h-4 w-4 flex-shrink-0 opacity-50" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── RESUMEN OPERATIVO ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Ventas 24h */}
        <Link href="/sales">
          <Card className="p-4 space-y-1 hover:bg-muted/30 transition-colors cursor-pointer">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShoppingBag className="h-3.5 w-3.5" /> Ventas 24h
            </div>
            <p className="text-2xl font-semibold">{fmt(data.sales.last_24h)}</p>
            <div className="flex gap-1 flex-wrap">
              {data.sales.pending_export > 0 && <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-300">{data.sales.pending_export} pendientes</Badge>}
              {data.sales.failed > 0 && <Badge variant="destructive" className="text-[10px]">{data.sales.failed} error</Badge>}
            </div>
          </Card>
        </Link>

        {/* Export Libral */}
        <Link href="/sales?filter=exported">
          <Card className="p-4 space-y-1 hover:bg-muted/30 transition-colors cursor-pointer">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Send className="h-3.5 w-3.5" /> Export Libral
            </div>
            <p className="text-2xl font-semibold">{fmt(data.sales.sent_today)}</p>
            <div className="flex gap-1 flex-wrap">
              {data.sales.export_blocked > 0 && <Badge variant="destructive" className="text-[10px]">{data.sales.export_blocked} bloqueados</Badge>}
            </div>
          </Card>
        </Link>

        {/* Stock */}
        <Link href="/inventory/stock">
          <Card className="p-4 space-y-1 hover:bg-muted/30 transition-colors cursor-pointer">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Package className="h-3.5 w-3.5" /> Stock
            </div>
            <p className="text-2xl font-semibold">{fmt(data.stock.products_with_stock)}</p>
            <p className="text-[10px] text-muted-foreground">de {fmt(data.stock.products_total)} productos</p>
          </Card>
        </Link>

        {/* Fuentes */}
        <Link href="/inventory/sources">
          <Card className="p-4 space-y-1 hover:bg-muted/30 transition-colors cursor-pointer">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="h-3.5 w-3.5" /> Fuentes
            </div>
            <p className="text-2xl font-semibold">{data.stock.sources_active}</p>
            <div className="flex gap-1 flex-wrap">
              {data.sources.filter((s) => s.status === "error").length > 0 && (
                <Badge variant="destructive" className="text-[10px]">{data.sources.filter((s) => s.status === "error").length} con error</Badge>
              )}
              {data.sources.filter((s) => s.status === "ok").length > 0 && (
                <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">{data.sources.filter((s) => s.status === "ok").length} OK</Badge>
              )}
            </div>
          </Card>
        </Link>

        {/* Cuentas */}
        <Link href="/integrations">
          <Card className="p-4 space-y-1 hover:bg-muted/30 transition-colors cursor-pointer">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Truck className="h-3.5 w-3.5" /> Cuentas
            </div>
            <p className="text-2xl font-semibold">{data.accounts.ml_total + data.accounts.shopify_total}</p>
            <div className="flex gap-1 flex-wrap">
              {data.accounts.ml_expired > 0 && <Badge variant="destructive" className="text-[10px]">{data.accounts.ml_expired} expiradas</Badge>}
              {(data.accounts.ml_missing_config + data.accounts.shopify_missing_config) > 0 && (
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                  {data.accounts.ml_missing_config + data.accounts.shopify_missing_config} sin config
                </Badge>
              )}
            </div>
          </Card>
        </Link>

        {/* Catálogo ML */}
        <Link href="/ml/publications">
          <Card className="p-4 space-y-1 hover:bg-muted/30 transition-colors cursor-pointer">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShoppingBag className="h-3.5 w-3.5" /> Catálogo ML
            </div>
            <p className="text-2xl font-semibold">{fmt(data.catalog.ml_publications)}</p>
            {data.catalog.ml_no_sku > 0 && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">{data.catalog.ml_no_sku} sin SKU</Badge>
            )}
          </Card>
        </Link>
      </div>

      {/* ── FUENTES CON DIAGNÓSTICO ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
            <h2 className="font-medium text-sm">Fuentes e importaciones</h2>
            <Link href="/inventory/sources"><Button variant="ghost" size="sm" className="text-xs h-7">Ver todas</Button></Link>
          </div>
          <div className="divide-y">
            {data.sources.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">Sin fuentes activas</p>
            ) : (
              data.sources.map((s) => (
                <div key={s.source_id} className="px-4 py-3 text-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{s.source_name}</p>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[s.status] ?? STATUS_COLORS.never_run}`}>
                        {STATUS_LABELS[s.status] ?? s.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.hours_since_run !== null && (
                        <span className="text-xs text-muted-foreground">{timeAgo(s.schedule?.last_run_at ?? null)}</span>
                      )}
                      {(s.status === "error" || s.status === "delayed" || s.status === "never_run") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={async () => {
                            try {
                              await fetch("/api/inventory/sources/run", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ source_id: s.source_id }),
                              })
                              fetchStats()
                            } catch {}
                          }}
                        >
                          Reintentar
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Schedule info */}
                  {s.schedule && (
                    <p className="text-[11px] text-muted-foreground">
                      {s.schedule.frequency === "daily" ? "Diaria" : s.schedule.frequency === "weekly" ? "Semanal" : s.schedule.frequency}{" "}
                      {String(s.schedule.hour).padStart(2, "0")}:{String(s.schedule.minute).padStart(2, "0")} {s.schedule.timezone?.includes("Argentina") ? "AR" : "UTC"}
                    </p>
                  )}
                  {/* Diagnosis */}
                  {s.diagnosis && (
                    <div className={`flex items-start gap-1.5 text-[11px] rounded px-2 py-1 ${
                      s.status === "error" ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                        : s.status === "delayed" ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                          : "bg-muted text-muted-foreground"
                    }`}>
                      <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">{s.diagnosis}</span>
                        {s.suggestion && <span className="ml-1 opacity-75">— {s.suggestion}</span>}
                      </div>
                    </div>
                  )}
                  {/* Last run details */}
                  {s.last_run && s.last_run.status === "completed" && !s.diagnosis && (
                    <p className="text-[11px] text-muted-foreground">
                      Último: {s.last_run.rows_updated ?? 0} actualizados, {s.last_run.rows_failed ?? 0} errores
                      {s.last_run.duration_ms ? ` (${(s.last_run.duration_ms / 1000).toFixed(1)}s)` : ""}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Cuentas e integraciones */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
            <h2 className="font-medium text-sm">Cuentas e integraciones</h2>
            <Link href="/integrations"><Button variant="ghost" size="sm" className="text-xs h-7">Configurar</Button></Link>
          </div>
          <div className="divide-y">
            {data.accounts.ml.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">{a.platform_code ?? "—"}</Badge>
                  <span className="font-medium">ML {a.nickname}</span>
                </div>
                <div className="flex items-center gap-2">
                  {!a.platform_code && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Sin code</Badge>}
                  {!a.empresa_id && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Sin empresa</Badge>}
                  {a.tokenExpired
                    ? <span className="text-red-600 text-xs flex items-center gap-0.5"><XCircle className="h-3 w-3" />Expirado</span>
                    : <span className="text-green-600 text-xs flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" />OK</span>
                  }
                </div>
              </div>
            ))}
            {data.accounts.shopify.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">{s.platform_code ?? "—"}</Badge>
                  <span className="font-medium">Shopify {s.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {!s.platform_code && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Sin code</Badge>}
                  {!s.empresa_id && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Sin empresa</Badge>}
                  <span className="text-green-600 text-xs flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" />Activa</span>
                </div>
              </div>
            ))}
            {data.accounts.ml.length === 0 && data.accounts.shopify.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">Sin cuentas configuradas</p>
            )}
          </div>
        </Card>
      </div>

      {/* ── LOGS RECIENTES ─────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/20">
          <h2 className="font-medium text-sm">Actividad reciente</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Hora</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Proceso</th>
                <th className="text-center px-4 py-2 font-medium text-muted-foreground text-xs">Estado</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Procesados</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Actualizados</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Fallidos</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Duración</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Error</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Sin actividad reciente</td></tr>
              ) : (
                data.logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{timeAgo(log.started_at)}</td>
                    <td className="px-4 py-2 text-xs font-medium">{log.name}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        log.status === "completed" ? STATUS_COLORS.ok
                          : log.status === "failed" ? STATUS_COLORS.error
                            : STATUS_COLORS.delayed
                      }`}>
                        {log.status === "completed" ? "OK" : log.status === "failed" ? "Error" : log.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-right tabular-nums">{log.processed ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-right tabular-nums">{log.updated ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-right tabular-nums text-red-600">{log.failed || "—"}</td>
                    <td className="px-4 py-2 text-xs text-right tabular-nums text-muted-foreground">
                      {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-red-600 max-w-[200px] truncate" title={log.error ?? ""}>
                      {log.error ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
