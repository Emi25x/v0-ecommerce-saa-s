"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import Link from "next/link"

function formatCurrency(v: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v)
}
function fmt(v: number) { return v.toLocaleString("es-AR") }
function fmtPct(v: number) { return `${v.toFixed(1)}%` }
function fmtRoas(v: number) { return `${v.toFixed(2)}x` }

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "text-green-600 border-green-600",
  PAUSED: "text-yellow-600 border-yellow-600",
  ARCHIVED: "text-gray-500 border-gray-400",
  DELETED: "text-red-600 border-red-600",
}

const DATE_RANGES = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
]

function formatDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split("T")[0]
}

export default function MetaAdsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState(30)
  const [notConnected, setNotConnected] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchData()
  }, [dateRange])

  async function fetchData() {
    setLoading(true)
    try {
      const startDate = formatDate(dateRange)
      const endDate = formatDate(0)
      const res = await fetch(`/api/marketing/meta/ads?start_date=${startDate}&end_date=${endDate}`)
      if (res.status === 404) { setNotConnected(true); setLoading(false); return }
      if (!res.ok) throw new Error("Error al cargar datos")
      const json = await res.json()
      setData(json)
      setNotConnected(false)
    } catch (e: any) {
      toast({ title: "Error Meta Ads", description: e.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  if (notConnected) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: "#1877F220" }}>
            <svg className="w-10 h-10" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Meta Ads no conectado</h2>
          <p className="text-muted-foreground mb-6">
            Conecta tu cuenta de Meta Ads para ver campañas de Facebook e Instagram
          </p>
          <div className="flex gap-3 justify-center">
            <Button asChild>
              <Link href="/marketing/config">Conectar Meta Ads</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/marketing">Volver</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
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
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#1877F2" }} />
              <h1 className="text-2xl font-bold">Meta Ads</h1>
            </div>
          </div>
          {/* Date Range Selector */}
          <div className="flex gap-2">
            {DATE_RANGES.map(range => (
              <Button
                key={range.days}
                size="sm"
                variant={dateRange === range.days ? "default" : "outline"}
                onClick={() => setDateRange(range.days)}
              >
                {range.label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => (
                <Card key={i}><CardContent className="pt-6"><Skeleton className="h-8 w-20 mb-2" /><Skeleton className="h-4 w-24" /></CardContent></Card>
              ))}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Account Overview */}
            {data.account && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-lg">{data.account.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Cuenta · {data.account.currency} · Gastado: {formatCurrency(parseFloat(data.account.amount_spent ?? 0) / 100)}
                      </div>
                    </div>
                    <Badge variant={data.account.account_status === 1 ? "outline" : "secondary"}
                      className={data.account.account_status === 1 ? "text-green-600 border-green-600" : ""}>
                      {data.account.account_status === 1 ? "Activa" : "Inactiva"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {[
                { label: "Alcance", value: fmt(data.totals?.reach ?? 0) },
                { label: "Impresiones", value: fmt(data.totals?.impressions ?? 0) },
                { label: "Clics", value: fmt(data.totals?.clicks ?? 0) },
                { label: "Gasto", value: formatCurrency(data.totals?.spend ?? 0) },
                { label: "Conversiones", value: (data.totals?.conversions ?? 0).toFixed(0) },
                { label: "ROAS", value: fmtRoas(data.totals?.roas ?? 0), highlight: true },
              ].map(kpi => (
                <Card key={kpi.label}>
                  <CardContent className="pt-6">
                    <div className={`text-2xl font-bold ${kpi.highlight ? "text-green-600" : ""}`}>{kpi.value}</div>
                    <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Campaign Table */}
            <Card>
              <CardHeader>
                <CardTitle>Campañas</CardTitle>
                <CardDescription>
                  {data.startDate} → {data.endDate} · {(data.campaigns ?? []).length} campañas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Campaña</th>
                        <th className="text-left py-2 px-4 font-medium text-muted-foreground">Estado</th>
                        <th className="text-right py-2 px-4 font-medium text-muted-foreground">Alcance</th>
                        <th className="text-right py-2 px-4 font-medium text-muted-foreground">Impresiones</th>
                        <th className="text-right py-2 px-4 font-medium text-muted-foreground">Clics</th>
                        <th className="text-right py-2 px-4 font-medium text-muted-foreground">Gasto</th>
                        <th className="text-right py-2 px-4 font-medium text-muted-foreground">Conv.</th>
                        <th className="text-right py-2 pl-4 font-medium text-muted-foreground">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.campaigns ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-8 text-muted-foreground">
                            No hay campañas en este período
                          </td>
                        </tr>
                      ) : (
                        (data.campaigns ?? []).map((c: any) => (
                          <tr key={c.campaign_id} className="border-b hover:bg-muted/30">
                            <td className="py-2 pr-4 font-medium max-w-[200px] truncate">{c.campaign_name}</td>
                            <td className="py-2 px-4">
                              <Badge variant="outline" className={`text-xs ${STATUS_BADGE[c.status] ?? ""}`}>
                                {c.status}
                              </Badge>
                            </td>
                            <td className="text-right py-2 px-4">{fmt(c.reach)}</td>
                            <td className="text-right py-2 px-4">{fmt(c.impressions)}</td>
                            <td className="text-right py-2 px-4">{fmt(c.clicks)}</td>
                            <td className="text-right py-2 px-4">{formatCurrency(c.spend)}</td>
                            <td className="text-right py-2 px-4">{c.conversions.toFixed(0)}</td>
                            <td className="text-right py-2 pl-4 font-medium text-green-600">{fmtRoas(c.roas)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  )
}
