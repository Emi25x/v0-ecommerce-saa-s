"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  ScanLine,
  TrendingUp,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  ChevronUp,
  ChevronDown,
} from "lucide-react"

const STATUS_LABELS: Record<string, string> = {
  new: "Nueva",
  reviewed: "Revisada",
  ignored: "Ignorada",
  published: "Publicada",
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  reviewed: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  ignored: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  published: "bg-green-500/15 text-green-400 border-green-500/30",
}

export default function MLIntelPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanningOpp, setScanningOpp] = useState(false)
  const [lastScanResult, setLastScanResult] = useState<any>(null)
  const [lastOppResult, setLastOppResult] = useState<any>(null)
  const [filterStatus, setFilterStatus] = useState<string>("new")
  const [loadingData, setLoadingData] = useState(false)
  const [sortField, setSortField] = useState<"opportunity_score" | "sold_qty_proxy" | "min_price">("opportunity_score")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")

  // Cargar cuentas
  useEffect(() => {
    fetch("/api/ml/accounts")
      .then((r) => r.json())
      .then((d) => {
        const accs = d.accounts || []
        setAccounts(accs)
        if (accs.length > 0) setSelectedAccountId(accs[0].id)
        setLoadingAccounts(false)
      })
      .catch(() => setLoadingAccounts(false))
  }, [])

  // Cargar oportunidades y snapshots cuando cambia cuenta o filtro
  const loadData = useCallback(async () => {
    if (!selectedAccountId) return
    setLoadingData(true)
    try {
      const [oppRes, snapRes] = await Promise.all([
        fetch(`/api/ml/intel/data?account_id=${selectedAccountId}&type=opportunities&status=${filterStatus}`),
        fetch(`/api/ml/intel/data?account_id=${selectedAccountId}&type=snapshots`),
      ])
      const oppData = await oppRes.json().catch(() => ({}))
      const snapData = await snapRes.json().catch(() => ({}))
      setOpportunities(oppData.rows || [])
      setSnapshots(snapData.rows || [])
    } finally {
      setLoadingData(false)
    }
  }, [selectedAccountId, filterStatus])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Ejecutar scan de mercado
  async function runScan() {
    if (!selectedAccountId) return
    setScanning(true)
    setLastScanResult(null)
    try {
      const res = await fetch(`/api/ml/intel/scan?account_id=${selectedAccountId}`)
      const data = await res.json()
      setLastScanResult(data)
      loadData()
    } catch (err: any) {
      setLastScanResult({ error: err.message })
    } finally {
      setScanning(false)
    }
  }

  // Ejecutar búsqueda de oportunidades
  async function runOpportunities() {
    if (!selectedAccountId) return
    setScanningOpp(true)
    setLastOppResult(null)
    try {
      const res = await fetch(`/api/ml/intel/opportunities?account_id=${selectedAccountId}`)
      const data = await res.json()
      setLastOppResult(data)
      loadData()
    } catch (err: any) {
      setLastOppResult({ error: err.message })
    } finally {
      setScanningOpp(false)
    }
  }

  // Cambiar status de oportunidad
  async function updateOpportunityStatus(id: string, status: string) {
    await fetch("/api/ml/intel/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    })
    setOpportunities((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)))
  }

  // Ordenar oportunidades
  const sortedOpportunities = [...opportunities].sort((a, b) => {
    const aVal = a[sortField] ?? 0
    const bVal = b[sortField] ?? 0
    return sortDir === "desc" ? bVal - aVal : aVal - bVal
  })

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return <ChevronDown className="h-3 w-3 opacity-30" />
    return sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
  }

  const formatPrice = (p: number | null) =>
    p != null ? `$${p.toLocaleString("es-AR", { maximumFractionDigits: 0 })}` : "-"

  if (loadingAccounts) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">ML Intel</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Datos de mercado y oportunidades de MercadoLibre Argentina. Solo lectura — no aplica cambios automaticos.
          </p>
        </div>
        {/* Selector de cuenta */}
        {accounts.length > 1 && (
          <select
            value={selectedAccountId || ""}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Acciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Scan de mercado */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-blue-400" />
              Scan de Mercado
            </CardTitle>
            <CardDescription className="text-xs">
              Analiza precios de mercado para cada EAN de tus publicaciones. Cache 24h por EAN.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={runScan} disabled={scanning || !selectedAccountId} size="sm" className="w-full">
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Escaneando...
                </>
              ) : (
                <>
                  <ScanLine className="h-4 w-4 mr-2" />
                  Iniciar Scan
                </>
              )}
            </Button>
            {lastScanResult && (
              <div className="text-xs text-muted-foreground space-y-1 border border-border rounded-md p-3 bg-muted/30">
                {lastScanResult.error ? (
                  <span className="text-red-400">{lastScanResult.error}</span>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>Escaneados</span>
                      <span className="text-foreground font-medium">{lastScanResult.scanned}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>En cache</span>
                      <span className="text-foreground font-medium">{lastScanResult.cached}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Errores</span>
                      <span className="text-foreground font-medium">{lastScanResult.errors}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tiempo</span>
                      <span className="text-foreground font-medium">{lastScanResult.elapsed_seconds}s</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Buscar oportunidades */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              Buscar Oportunidades
            </CardTitle>
            <CardDescription className="text-xs">
              Detecta productos con EAN en tus categorias que no estas publicando. Score conservador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={runOpportunities}
              disabled={scanningOpp || !selectedAccountId}
              size="sm"
              variant="outline"
              className="w-full"
            >
              {scanningOpp ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Buscando...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Buscar Oportunidades
                </>
              )}
            </Button>
            {lastOppResult && (
              <div className="text-xs text-muted-foreground space-y-1 border border-border rounded-md p-3 bg-muted/30">
                {lastOppResult.error ? (
                  <span className="text-red-400">{lastOppResult.error}</span>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>Categorias</span>
                      <span className="text-foreground font-medium">{lastOppResult.categories_scanned}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Items analizados</span>
                      <span className="text-foreground font-medium">{lastOppResult.items_found}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Oportunidades</span>
                      <span className="text-foreground font-medium">{lastOppResult.opportunities_upserted}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tiempo</span>
                      <span className="text-foreground font-medium">{lastOppResult.elapsed_seconds}s</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Snapshots resumen */}
      {snapshots.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Ultimos snapshots de mercado — {snapshots.length} EANs con datos de hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">EAN</th>
                    <th className="text-right py-2 px-3 font-medium">Min</th>
                    <th className="text-right py-2 px-3 font-medium">Median</th>
                    <th className="text-right py-2 px-3 font-medium">Avg</th>
                    <th className="text-right py-2 px-3 font-medium">Sellers</th>
                    <th className="text-right py-2 pl-3 font-medium">Vendidos</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.slice(0, 20).map((s: any) => (
                    <tr key={s.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2 pr-4 font-mono text-foreground">{s.ean}</td>
                      <td className="text-right py-2 px-3 text-foreground">{formatPrice(s.min_price)}</td>
                      <td className="text-right py-2 px-3 text-foreground">{formatPrice(s.median_price)}</td>
                      <td className="text-right py-2 px-3 text-muted-foreground">{formatPrice(s.avg_price)}</td>
                      <td className="text-right py-2 px-3 text-muted-foreground">{s.sellers_count ?? "-"}</td>
                      <td className="text-right py-2 pl-3 text-muted-foreground">{s.sold_qty_proxy ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Oportunidades */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Oportunidades Detectadas</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={loadData} disabled={loadingData}>
                <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? "animate-spin" : ""}`} />
              </Button>
              {/* Filtro status */}
              <div className="flex gap-1">
                {["new", "reviewed", "ignored", "published"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${filterStatus === s ? STATUS_COLORS[s] : "border-border text-muted-foreground hover:border-border/80"}`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingData ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sortedOpportunities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No hay oportunidades con estado "{STATUS_LABELS[filterStatus]}". Ejecuta "Buscar Oportunidades".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium">Titulo</th>
                    <th className="text-left py-2 pr-3 font-medium">EAN</th>
                    <th
                      className="text-right py-2 px-3 font-medium cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("min_price")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Precio <SortIcon field="min_price" />
                      </span>
                    </th>
                    <th
                      className="text-right py-2 px-3 font-medium cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("sold_qty_proxy")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Vendidos <SortIcon field="sold_qty_proxy" />
                      </span>
                    </th>
                    <th
                      className="text-right py-2 px-3 font-medium cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("opportunity_score")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Score <SortIcon field="opportunity_score" />
                      </span>
                    </th>
                    <th className="text-center py-2 pl-3 font-medium">Estado</th>
                    <th className="text-center py-2 pl-3 font-medium">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOpportunities.map((opp: any) => (
                    <tr key={opp.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2 pr-3 text-foreground max-w-[220px] truncate" title={opp.title}>
                        {opp.title || "-"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">{opp.ean}</td>
                      <td className="text-right py-2 px-3 text-foreground">{formatPrice(opp.min_price)}</td>
                      <td className="text-right py-2 px-3 text-muted-foreground">{opp.sold_qty_proxy ?? "-"}</td>
                      <td className="text-right py-2 px-3">
                        <span
                          className={`font-medium ${opp.opportunity_score >= 50 ? "text-green-400" : opp.opportunity_score >= 20 ? "text-yellow-400" : "text-muted-foreground"}`}
                        >
                          {opp.opportunity_score?.toFixed(0) ?? "-"}
                        </span>
                      </td>
                      <td className="text-center py-2 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] border ${STATUS_COLORS[opp.status] || STATUS_COLORS.new}`}
                        >
                          {STATUS_LABELS[opp.status] || opp.status}
                        </span>
                      </td>
                      <td className="text-center py-2 pl-3">
                        <div className="flex items-center justify-center gap-1">
                          {opp.status !== "reviewed" && (
                            <button
                              onClick={() => updateOpportunityStatus(opp.id, "reviewed")}
                              className="p-1 hover:text-yellow-400 text-muted-foreground transition-colors"
                              title="Marcar revisada"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {opp.status !== "ignored" && (
                            <button
                              onClick={() => updateOpportunityStatus(opp.id, "ignored")}
                              className="p-1 hover:text-red-400 text-muted-foreground transition-colors"
                              title="Ignorar"
                            >
                              <EyeOff className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {opp.status === "reviewed" && (
                            <button
                              onClick={() => updateOpportunityStatus(opp.id, "published")}
                              className="p-1 hover:text-green-400 text-muted-foreground transition-colors"
                              title="Marcar publicada"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
