import { Package, Database, ShoppingCart, Truck } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ProviderCard } from "@/components/dashboard/provider-card"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { createClient } from "@/lib/db/server"
import type { ProcessRun } from "@/components/dashboard/types"

async function getDashboardData() {
  try {
    const supabase = await createClient()

    const [productsRes, withStockRes, pendingRes, publishedRes, activeRes, runsRes] = await Promise.all([
      supabase.from("products").select("*", { count: "exact", head: true }),
      supabase.from("products").select("*", { count: "exact", head: true }).gt("stock", 0),
      supabase.from("products").select("*", { count: "exact", head: true }).gt("stock", 0).is("ml_item_id", null),
      supabase.from("products").select("*", { count: "exact", head: true }).not("ml_item_id", "is", null),
      supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .not("ml_item_id", "is", null)
        .eq("ml_status", "active"),
      supabase
        .from("process_runs")
        .select(
          "process_type, process_name, status, started_at, duration_ms, rows_processed, rows_updated, rows_failed, error_message",
        )
        .order("started_at", { ascending: false })
        .limit(10),
    ])

    const totalProducts = productsRes.count ?? 0
    const withStock = withStockRes.count ?? 0
    const pendingPublish = pendingRes.count ?? 0
    const totalPublished = publishedRes.count ?? 0
    const activeListings = activeRes.count ?? 0

    // Providers
    const { data: providers } = await supabase
      .from("import_sources")
      .select("name, is_active, last_run, last_status")
      .order("name")

    return {
      stats: { totalProducts, withStock, pendingPublish },
      ml: { totalPublished, active: activeListings },
      providers: (providers ?? []).map((p) => ({
        name: p.name,
        is_active: p.is_active,
        last_run: p.last_run,
        last_status: p.last_status,
        products_count: 0,
        stock_total: 0,
      })),
      recentRuns: (runsRes.data ?? []) as ProcessRun[],
    }
  } catch {
    return {
      stats: { totalProducts: 0, withStock: 0, pendingPublish: 0 },
      ml: { totalPublished: 0, active: 0 },
      providers: [],
      recentRuns: [],
    }
  }
}

export default async function DashboardPage() {
  const { stats, ml, providers, recentRuns } = await getDashboardData()

  const stockPct = stats.totalProducts > 0 ? `${Math.round((stats.withStock / stats.totalProducts) * 100)}%` : undefined

  return (
    <div className="min-h-full bg-background">
      <PageHeader title="Dashboard" description="Resumen general de tu operación" />

      <div className="space-y-6 p-6">
        {/* KPI row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Productos" value={stats.totalProducts} icon={Package} loading={false} href="/inventory" />
          <KpiCard
            title="Con stock"
            value={stats.withStock}
            icon={Database}
            loading={false}
            href="/inventory/stock"
            detail={stockPct}
          />
          <KpiCard
            title="Publicaciones ML"
            value={ml.totalPublished}
            icon={ShoppingCart}
            loading={false}
            href="/ml/publications"
            detail={ml.active ? `${ml.active} activas` : undefined}
          />
          <KpiCard
            title="Pendientes publicar"
            value={stats.pendingPublish}
            icon={Truck}
            loading={false}
            href="/ml/priorities"
          />
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ProviderCard providers={providers} loading={false} />
          <QuickActions />
        </div>

        {/* Activity */}
        <RecentActivity runs={recentRuns} />
      </div>
    </div>
  )
}
