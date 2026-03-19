"use client"

import { useEffect, useState } from "react"
import { Package, Database, ShoppingCart, Truck } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ProviderCard } from "@/components/dashboard/provider-card"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import type { OpsStatus, ProcessRun } from "@/components/dashboard/types"

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

  const stats = ops?.system_stats
  const stockPct = stats
    ? `${Math.round((stats.with_stock / Math.max(stats.total_products, 1)) * 100)}%`
    : undefined

  return (
    <div className="min-h-full bg-background">
      <PageHeader title="Dashboard" description="Resumen general de tu operación" />

      <div className="space-y-6 p-6">
        {/* KPI row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Productos" value={stats?.total_products} icon={Package} loading={loading} href="/inventory" />
          <KpiCard
            title="Con stock"
            value={stats?.with_stock}
            icon={Database}
            loading={loading}
            href="/inventory/stock"
            detail={stockPct}
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
            value={stats?.pending_publish}
            icon={Truck}
            loading={loading}
            href="/ml/priorities"
          />
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ProviderCard providers={ops?.providers ?? []} loading={loading} />
          <QuickActions />
        </div>

        {/* Activity */}
        <RecentActivity runs={recentRuns} />
      </div>
    </div>
  )
}
