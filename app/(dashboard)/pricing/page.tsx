"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Tag, List, ArrowLeftRight, Calculator, BarChart2,
  AlertTriangle, TrendingDown, Package, FileText, RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"

// ── Types ──────────────────────────────────────────────────────────────────

interface Stats {
  active_lists:  number
  calculated:    number
  with_warnings: number
  margin_low:    number
  sin_costo:     number
  sin_pvp:       number
}

interface RecentList {
  id:           string
  name:         string
  channel:      string
  currency:     string
  pricing_base: string
  updated_at:   string
}

// ── Helpers ────────────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  ml: "Mercado Libre", shopify: "Shopify", web: "Web", mayorista: "Mayorista",
}
const BASE_LABEL: Record<string, string> = {
  cost: "Costo", pvp: "PVP", hybrid: "Híbrido",
}
const BASE_COLOR: Record<string, string> = {
  cost:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  pvp:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  hybrid: "bg-amber-500/15 text-amber-400 border-amber-500/30",
}
const relDate = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const m    = Math.floor(diff / 60000)
  if (m < 1)   return "ahora"
  if (m < 60)  return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24)  return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

// ── StatCard ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "default", href }: {
  label: string; value: number | string; sub?: string
  color?: "default" | "green" | "amber" | "red" | "blue"
  href?: string
}) {
  const colorCls = {
    default: "border-border",
    green:   "border-green-500/30 bg-green-500/5",
    amber:   "border-amber-500/30 bg-amber-500/5",
    red:     "border-red-500/30 bg-red-500/5",
    blue:    "border-blue-500/30 bg-blue-500/5",
  }[color]

  const content = (
    <div className={`rounded-lg border ${colorCls} bg-card p-5 flex flex-col gap-1 transition-colors hover:bg-muted/10`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${color === "red" ? "text-red-400" : color === "amber" ? "text-amber-400" : ""}`}>
        {typeof value === "number" ? value.toLocaleString("es-AR") : value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )

  return href ? <Link href={href}>{content}</Link> : content
}

// ── Quick links ────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { href: "/pricing/lists",          icon: List,          label: "Listas de precios",  desc: "Crear y editar listas con reglas y tramos" },
  { href: "/pricing/assignments",    icon: ArrowLeftRight, label: "Asignaciones",       desc: "Asignar listas a cuentas ML, Shopify o canales" },
  { href: "/pricing/exchange-rates", icon: Tag,            label: "Tipos de cambio",    desc: "Gestionar tasas manuales o automáticas" },
  { href: "/pricing/calculator",     icon: Calculator,     label: "Calculadora",        desc: "Simular precio para un producto y lista" },
  { href: "/pricing/results",        icon: BarChart2,      label: "Resultados",         desc: "Ver precios calculados con margen y warnings" },
]

// ── Page ───────────────────────────────────────────────────────────────────

export default function PricingDashboard() {
  const [stats,       setStats]       = useState<Stats | null>(null)
  const [recentLists, setRecentLists] = useState<RecentList[]>([])
  const [loading,     setLoading]     = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/pricing/stats")
      const data = await res.json()
      if (data.ok) { setStats(data.stats); setRecentLists(data.recent_lists ?? []) }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Motor de precios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Central de cálculo desacoplada. Configura listas, reglas y asignaciones sin tocar las integraciones.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Listas activas"
          value={loading ? "—" : (stats?.active_lists ?? 0)}
          href="/pricing/lists"
          color="blue"
        />
        <StatCard
          label="Productos calculados"
          value={loading ? "—" : (stats?.calculated ?? 0)}
          href="/pricing/results"
        />
        <StatCard
          label="Con warnings"
          value={loading ? "—" : (stats?.with_warnings ?? 0)}
          sub="falta costo, pvp o reglas"
          href="/pricing/results?warnings_only=1"
          color={stats?.with_warnings ? "amber" : "default"}
        />
        <StatCard
          label="Margen insuficiente"
          value={loading ? "—" : (stats?.margin_low ?? 0)}
          sub="por debajo del minimo"
          href="/pricing/results?margin_low=1"
          color={stats?.margin_low ? "red" : "default"}
        />
        <StatCard
          label="Sin costo"
          value={loading ? "—" : (stats?.sin_costo ?? 0)}
          sub="productos sin supplier_cost"
          color={stats?.sin_costo ? "amber" : "default"}
        />
        <StatCard
          label="Sin PVP editorial"
          value={loading ? "—" : (stats?.sin_pvp ?? 0)}
          sub="productos sin pvp_editorial"
          color={stats?.sin_pvp ? "amber" : "default"}
        />
      </div>

      {/* Quick nav */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Secciones</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_LINKS.map(({ href, icon: Icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg border border-border bg-card p-4 flex items-start gap-3 hover:bg-muted/10 transition-colors"
            >
              <div className="rounded-md bg-muted/40 p-2 flex-shrink-0">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent lists */}
      {recentLists.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Listas recientes
          </h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nombre</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Canal</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Base</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {recentLists.map(l => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link href={`/pricing/lists`} className="font-medium hover:underline">{l.name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{CHANNEL_LABEL[l.channel] ?? l.channel}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium ${BASE_COLOR[l.pricing_base] ?? ""}`}>
                        {BASE_LABEL[l.pricing_base] ?? l.pricing_base}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{relDate(l.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alerts */}
      {(stats?.with_warnings ?? 0) > 0 || (stats?.margin_low ?? 0) > 0 ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            {(stats?.with_warnings ?? 0) > 0 && (
              <p>
                <span className="font-semibold text-foreground">{stats!.with_warnings}</span> productos con warnings (falta costo, PVP o reglas de canal).{" "}
                <Link href="/pricing/results?warnings_only=1" className="underline text-amber-400">Ver</Link>
              </p>
            )}
            {(stats?.margin_low ?? 0) > 0 && (
              <p className="mt-1">
                <span className="font-semibold text-foreground">{stats!.margin_low}</span> productos con margen por debajo del mínimo.{" "}
                <Link href="/pricing/results?margin_low=1" className="underline text-red-400">Ver</Link>
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
