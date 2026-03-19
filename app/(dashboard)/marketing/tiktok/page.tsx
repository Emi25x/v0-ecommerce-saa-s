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
function fmt(v: number) {
  return v.toLocaleString("es-AR")
}
function fmtPct(v: number) {
  return `${v.toFixed(2)}%`
}

const STATUS_BADGE: Record<string, string> = {
  ENABLE: "text-green-600 border-green-600",
  DISABLE: "text-yellow-600 border-yellow-600",
  DELETE: "text-red-600 border-red-600",
  DRAFT: "text-gray-500 border-gray-400",
}

export default function TikTokAdsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch("/api/marketing/tiktok/ads")
      if (res.status === 404) {
        setNotConnected(true)
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error("Error al cargar datos")
      const json = await res.json()
      setData(json)
      setNotConnected(false)
    } catch (e: any) {
      toast({ title: "Error TikTok Ads", description: e.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  // Aggregate report metrics
  const reportTotals = data?.report
    ? data.report.reduce(
        (acc: any, r: any) => ({
          spend: acc.spend + parseFloat(r.metrics?.spend ?? 0),
          impressions: acc.impressions + parseInt(r.metrics?.impressions ?? 0),
          clicks: acc.clicks + parseInt(r.metrics?.clicks ?? 0),
          conversions: acc.conversions + parseInt(r.metrics?.conversion ?? 0),
        }),
        { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
      )
    : null

  if (notConnected) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-black flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.94a8.16 8.16 0 004.77 1.52V7.01a4.85 4.85 0 01-1-.32z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">TikTok Ads no conectado</h2>
          <p className="text-muted-foreground mb-6">
            Conecta tu cuenta de TikTok Ads para ver el rendimiento de tus campañas
          </p>
          <div className="flex gap-3 justify-center">
            <Button asChild>
              <Link href="/marketing/config">Conectar TikTok Ads</Link>
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
        <div className="flex items-center gap-3 mb-8">
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
            <div className="w-3 h-3 rounded-full bg-black" />
            <h1 className="text-2xl font-bold">TikTok Ads</h1>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <Skeleton className="h-8 w-20 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{formatCurrency(reportTotals?.spend ?? 0)}</div>
                  <p className="text-sm text-muted-foreground">Gasto Total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{fmt(reportTotals?.impressions ?? 0)}</div>
                  <p className="text-sm text-muted-foreground">Impresiones</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{fmt(reportTotals?.clicks ?? 0)}</div>
                  <p className="text-sm text-muted-foreground">Clics</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{fmt(reportTotals?.conversions ?? 0)}</div>
                  <p className="text-sm text-muted-foreground">Conversiones</p>
                </CardContent>
              </Card>
            </div>

            {/* Additional KPIs from report */}
            {data.report &&
              data.report.length > 0 &&
              (() => {
                const latest = data.report[data.report.length - 1]?.metrics ?? {}
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{fmtPct(parseFloat(latest.ctr ?? 0))}</div>
                        <p className="text-sm text-muted-foreground">CTR</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{formatCurrency(parseFloat(latest.cpc ?? 0))}</div>
                        <p className="text-sm text-muted-foreground">CPC</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{fmtPct(parseFloat(latest.conversion_rate ?? 0))}</div>
                        <p className="text-sm text-muted-foreground">Conv. Rate</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">
                          {formatCurrency(parseFloat(latest.cost_per_conversion ?? 0))}
                        </div>
                        <p className="text-sm text-muted-foreground">Costo por Conv.</p>
                      </CardContent>
                    </Card>
                  </div>
                )
              })()}

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
                        <th className="text-left py-2 px-4 font-medium text-muted-foreground">Objetivo</th>
                        <th className="text-right py-2 px-4 font-medium text-muted-foreground">Presupuesto</th>
                        <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Modo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.campaigns ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-8 text-muted-foreground">
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
                            <td className="py-2 px-4 text-muted-foreground text-xs">{c.objective_type}</td>
                            <td className="text-right py-2 px-4">
                              {c.budget ? formatCurrency(parseFloat(c.budget)) : "-"}
                            </td>
                            <td className="text-right py-2 pl-4 text-xs text-muted-foreground">{c.budget_mode}</td>
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
