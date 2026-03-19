"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  return `${v.toFixed(1)}%`
}
function fmtRoas(v: number) {
  return `${v.toFixed(2)}x`
}
function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}m ${s}s`
}

const STATUS_COLORS: Record<string, string> = {
  ENABLED: "text-green-600 border-green-600",
  PAUSED: "text-yellow-600 border-yellow-600",
  REMOVED: "text-red-600 border-red-600",
  Active: "text-green-600 border-green-600",
  Paused: "text-yellow-600 border-yellow-600",
  sent: "text-green-600 border-green-600",
}

export default function GoogleMarketingPage() {
  const [tab, setTab] = useState("analytics")
  const [analyticsData, setAnalyticsData] = useState<any>(null)
  const [adsData, setAdsData] = useState<any>(null)
  const [searchData, setSearchData] = useState<any>(null)
  const [merchantData, setMerchantData] = useState<any>(null)
  const [connections, setConnections] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const { toast } = useToast()

  useEffect(() => {
    checkConnections()
  }, [])

  useEffect(() => {
    if (tab === "analytics" && !analyticsData) fetchAnalytics()
    if (tab === "ads" && !adsData) fetchAds()
    if (tab === "search" && !searchData) fetchSearch()
    if (tab === "merchant" && !merchantData) fetchMerchant()
  }, [tab])

  async function checkConnections() {
    const res = await fetch("/api/marketing/connections")
    const data = await res.json()
    const map: Record<string, boolean> = {}
    for (const c of data.connections ?? []) {
      map[c.platform] = c.is_active
    }
    setConnections(map)
  }

  async function fetchAnalytics() {
    setLoading((p) => ({ ...p, analytics: true }))
    try {
      const res = await fetch("/api/marketing/google/analytics")
      if (res.status === 404) {
        setAnalyticsData({ notConnected: true })
        return
      }
      const data = await res.json()
      setAnalyticsData(data)
    } catch (e: any) {
      toast({ title: "Error GA4", description: e.message, variant: "destructive" })
    } finally {
      setLoading((p) => ({ ...p, analytics: false }))
    }
  }

  async function fetchAds() {
    setLoading((p) => ({ ...p, ads: true }))
    try {
      const res = await fetch("/api/marketing/google/ads")
      if (res.status === 404) {
        setAdsData({ notConnected: true })
        return
      }
      const data = await res.json()
      setAdsData(data)
    } catch (e: any) {
      toast({ title: "Error Google Ads", description: e.message, variant: "destructive" })
    } finally {
      setLoading((p) => ({ ...p, ads: false }))
    }
  }

  async function fetchSearch() {
    setLoading((p) => ({ ...p, search: true }))
    try {
      const res = await fetch("/api/marketing/google/search-console")
      if (res.status === 404) {
        setSearchData({ notConnected: true })
        return
      }
      const data = await res.json()
      setSearchData(data)
    } catch (e: any) {
      toast({ title: "Error Search Console", description: e.message, variant: "destructive" })
    } finally {
      setLoading((p) => ({ ...p, search: false }))
    }
  }

  async function fetchMerchant() {
    setLoading((p) => ({ ...p, merchant: true }))
    try {
      const res = await fetch("/api/marketing/google/merchant")
      if (res.status === 404) {
        setMerchantData({ notConnected: true })
        return
      }
      const data = await res.json()
      setMerchantData(data)
    } catch (e: any) {
      toast({ title: "Error Merchant", description: e.message, variant: "destructive" })
    } finally {
      setLoading((p) => ({ ...p, merchant: false }))
    }
  }

  function NotConnected({ platform }: { platform: string }) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2">{platform} no conectado</h3>
        <p className="text-muted-foreground mb-4">Configura las credenciales para ver los datos</p>
        <Button asChild>
          <Link href="/marketing/config">Conectar ahora</Link>
        </Button>
      </div>
    )
  }

  // Calculate analytics totals
  const analyticsTotals = analyticsData?.report
    ? analyticsData.report.reduce(
        (acc: any, r: any) => ({
          sessions: acc.sessions + r.sessions,
          users: acc.users + r.users,
          pageviews: acc.pageviews + r.pageviews,
          conversions: acc.conversions + r.conversions,
          revenue: acc.revenue + r.revenue,
        }),
        { sessions: 0, users: 0, pageviews: 0, conversions: 0, revenue: 0 },
      )
    : null

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
          <h1 className="text-2xl font-bold">Google Marketing</h1>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="analytics">
              <div className="w-2 h-2 rounded-full bg-yellow-500 mr-2" />
              Analytics 4
            </TabsTrigger>
            <TabsTrigger value="ads">
              <div className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
              Google Ads
            </TabsTrigger>
            <TabsTrigger value="search">
              <div className="w-2 h-2 rounded-full bg-green-500 mr-2" />
              Search Console
            </TabsTrigger>
            <TabsTrigger value="merchant">
              <div className="w-2 h-2 rounded-full bg-red-500 mr-2" />
              Merchant Center
            </TabsTrigger>
          </TabsList>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            {loading.analytics ? (
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
              </div>
            ) : analyticsData?.notConnected ? (
              <NotConnected platform="Google Analytics 4" />
            ) : analyticsData ? (
              <div className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{fmt(analyticsTotals?.sessions ?? 0)}</div>
                      <p className="text-sm text-muted-foreground">Sesiones</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{fmt(analyticsTotals?.users ?? 0)}</div>
                      <p className="text-sm text-muted-foreground">Usuarios</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{fmt(analyticsTotals?.pageviews ?? 0)}</div>
                      <p className="text-sm text-muted-foreground">Páginas vistas</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{fmt(analyticsTotals?.conversions ?? 0)}</div>
                      <p className="text-sm text-muted-foreground">Conversiones</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Data Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Reporte por día</CardTitle>
                    <CardDescription>
                      {analyticsData.startDate} → {analyticsData.endDate}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Fecha</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Sesiones</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Usuarios</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Páginas</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Bounce</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Duración</th>
                            <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Conversiones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(analyticsData.report ?? [])
                            .slice()
                            .reverse()
                            .slice(0, 30)
                            .map((row: any) => (
                              <tr key={row.date} className="border-b hover:bg-muted/30">
                                <td className="py-2 pr-4 font-mono text-xs">{row.date}</td>
                                <td className="text-right py-2 px-4">{fmt(row.sessions)}</td>
                                <td className="text-right py-2 px-4">{fmt(row.users)}</td>
                                <td className="text-right py-2 px-4">{fmt(row.pageviews)}</td>
                                <td className="text-right py-2 px-4">{fmtPct(row.bounce_rate * 100)}</td>
                                <td className="text-right py-2 px-4">{fmtDuration(row.avg_session_duration)}</td>
                                <td className="text-right py-2 pl-4">{row.conversions.toFixed(0)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">Cargando datos...</div>
            )}
          </TabsContent>

          {/* Google Ads Tab */}
          <TabsContent value="ads">
            {loading.ads ? (
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
            ) : adsData?.notConnected ? (
              <NotConnected platform="Google Ads" />
            ) : adsData ? (
              <div className="space-y-6">
                {/* Totals */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{formatCurrency(adsData.totals?.spend ?? 0)}</div>
                      <p className="text-sm text-muted-foreground">Gasto Total</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{fmt(adsData.totals?.impressions ?? 0)}</div>
                      <p className="text-sm text-muted-foreground">Impresiones</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{fmt(adsData.totals?.clicks ?? 0)}</div>
                      <p className="text-sm text-muted-foreground">Clics</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{(adsData.totals?.conversions ?? 0).toFixed(0)}</div>
                      <p className="text-sm text-muted-foreground">Conversiones</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-green-600">{fmtRoas(adsData.totals?.roas ?? 0)}</div>
                      <p className="text-sm text-muted-foreground">ROAS</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Campaign Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Campañas</CardTitle>
                    <CardDescription>
                      {adsData.startDate} → {adsData.endDate}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Campaña</th>
                            <th className="text-left py-2 px-4 font-medium text-muted-foreground">Estado</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Impresiones</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Clics</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Gasto</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Conv.</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">ROAS</th>
                            <th className="text-right py-2 pl-4 font-medium text-muted-foreground">CTR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(adsData.campaigns ?? []).map((c: any) => (
                            <tr key={c.campaign_id} className="border-b hover:bg-muted/30">
                              <td className="py-2 pr-4 font-medium max-w-[200px] truncate">{c.campaign_name}</td>
                              <td className="py-2 px-4">
                                <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>
                                  {c.status}
                                </Badge>
                              </td>
                              <td className="text-right py-2 px-4">{fmt(c.impressions)}</td>
                              <td className="text-right py-2 px-4">{fmt(c.clicks)}</td>
                              <td className="text-right py-2 px-4">{formatCurrency(c.spend)}</td>
                              <td className="text-right py-2 px-4">{c.conversions.toFixed(0)}</td>
                              <td className="text-right py-2 px-4 font-medium text-green-600">{fmtRoas(c.roas)}</td>
                              <td className="text-right py-2 pl-4">{fmtPct(c.ctr * 100)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">Cargando datos...</div>
            )}
          </TabsContent>

          {/* Search Console Tab */}
          <TabsContent value="search">
            {loading.search ? (
              <Skeleton className="h-64 w-full" />
            ) : searchData?.notConnected ? (
              <NotConnected platform="Google Search Console" />
            ) : searchData ? (
              <Card>
                <CardHeader>
                  <CardTitle>Top Queries SEO</CardTitle>
                  <CardDescription>
                    {searchData.startDate} → {searchData.endDate}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Query</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Clics</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Impresiones</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">CTR</th>
                          <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Posición</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(searchData.rows ?? []).map((row: any, i: number) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="py-2 pr-4 max-w-[300px] truncate">{row.keys?.[0]}</td>
                            <td className="text-right py-2 px-4">{fmt(row.clicks)}</td>
                            <td className="text-right py-2 px-4">{fmt(row.impressions)}</td>
                            <td className="text-right py-2 px-4">{fmtPct(row.ctr * 100)}</td>
                            <td className="text-right py-2 pl-4">{row.position.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-16 text-muted-foreground">Cargando datos...</div>
            )}
          </TabsContent>

          {/* Merchant Center Tab */}
          <TabsContent value="merchant">
            {loading.merchant ? (
              <Skeleton className="h-64 w-full" />
            ) : merchantData?.notConnected ? (
              <NotConnected platform="Google Merchant Center" />
            ) : merchantData ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-3xl font-bold">{fmt(merchantData.total ?? 0)}</div>
                      <p className="text-sm text-muted-foreground">Productos totales</p>
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Productos recientes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(merchantData.products ?? []).map((p: any) => (
                        <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30">
                          {p.image_link && (
                            <img src={p.image_link} alt={p.title} className="w-12 h-12 object-cover rounded" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{p.title}</div>
                            <div className="text-sm text-muted-foreground">{p.brand}</div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-medium">
                              {p.currency} {p.price}
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {p.availability}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">Cargando datos...</div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
