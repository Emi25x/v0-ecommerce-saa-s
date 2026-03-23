"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  ShieldAlert,
  Package,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// ── Types ─────────────────────────────────────────────────────────────────

interface CandidateItem {
  product_id: string
  ean: string | null
  title: string | null
  publisher: string | null
  warehouse_stock: number
  supplier_sources: Record<string, number>
  margin_percent: number | null
  eligibility: {
    eligible: boolean
    reason: string
    priority_score: number
  }
  supplier_confidence_score: number | null
  suggested_channels: {
    ml: boolean
    shopify: boolean
  }
}

interface CandidatesResponse {
  items: CandidateItem[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}

interface StoreOption {
  id: string
  nickname?: string
  name?: string
}

interface SummaryStats {
  total_products: number
  eligible_products: number
  blocked_low_margin: number
  blocked_low_stock: number
  dual_supplier_products: number
  avg_margin_eligible: number | null
}

// ── Constants ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

// ── Component ─────────────────────────────────────────────────────────────

export default function PublicationCandidatesPage() {
  // Data
  const [items, setItems] = useState<CandidateItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  // Filters
  const [storeId, setStoreId] = useState("")
  const [channel, setChannel] = useState<"all" | "ml" | "shopify">("all")
  const [onlyEligible, setOnlyEligible] = useState(false)
  const [minMargin, setMinMargin] = useState("")
  const [page, setPage] = useState(0)

  // Summary stats
  const [summary, setSummary] = useState<SummaryStats | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Store options
  const [mlAccounts, setMlAccounts] = useState<StoreOption[]>([])
  const [shopifyStores, setShopifyStores] = useState<StoreOption[]>([])
  const [storesLoaded, setStoresLoaded] = useState(false)

  // ── Load stores ───────────────────────────────────────────────────────
  useEffect(() => {
    async function loadStores() {
      try {
        const [mlRes, shopifyRes] = await Promise.allSettled([
          fetch("/api/ml/accounts").then((r) => r.json()),
          fetch("/api/shopify/stores").then((r) => r.json()),
        ])

        if (mlRes.status === "fulfilled" && mlRes.value?.accounts) {
          setMlAccounts(mlRes.value.accounts)
        }
        if (shopifyRes.status === "fulfilled") {
          const stores = shopifyRes.value?.stores ?? shopifyRes.value ?? []
          if (Array.isArray(stores)) setShopifyStores(stores)
        }
      } catch {
        // ignore — stores will be empty
      } finally {
        setStoresLoaded(true)
      }
    }
    loadStores()
  }, [])

  // Auto-select first store
  useEffect(() => {
    if (storesLoaded && !storeId) {
      const first = mlAccounts[0] ?? shopifyStores[0]
      if (first) setStoreId(first.id)
    }
  }, [storesLoaded, mlAccounts, shopifyStores, storeId])

  // ── Load summary stats ─────────────────────────────────────────────────
  useEffect(() => {
    if (!storeId) return
    setSummaryLoading(true)
    fetch(`/api/products/publication-summary?store_id=${storeId}`)
      .then((r) => r.json())
      .then((data) => setSummary(data))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false))
  }, [storeId])

  // ── Load candidates ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        store_id: storeId,
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      })
      if (channel !== "all") params.set("channel", channel)
      if (onlyEligible) params.set("only_eligible", "true")

      const res = await fetch(`/api/products/publication-candidates?${params}`)
      const data: CandidatesResponse = await res.json()

      let filtered = data.items ?? []

      // Client-side margin filter
      if (minMargin) {
        const min = parseFloat(minMargin)
        if (!isNaN(min)) {
          filtered = filtered.filter((i) => (i.margin_percent ?? -Infinity) >= min)
        }
      }

      setItems(filtered)
      setTotal(data.pagination?.total ?? 0)
    } catch {
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [storeId, channel, onlyEligible, minMargin, page])

  useEffect(() => {
    load()
  }, [load])

  // Reset page on filter change
  useEffect(() => {
    setPage(0)
  }, [storeId, channel, onlyEligible, minMargin])

  // ── Helpers ───────────────────────────────────────────────────────────
  const supplierSourceKeys = (sources: Record<string, number>) => {
    return Object.entries(sources)
      .filter(([, v]) => v > 0)
      .map(([k]) => k)
  }

  const hasDualSupplier = (sources: Record<string, number>) => {
    return supplierSourceKeys(sources).length >= 2
  }

  const allStores: { id: string; label: string; type: "ml" | "shopify" }[] = [
    ...mlAccounts.map((a) => ({ id: a.id, label: `ML: ${a.nickname ?? a.id}`, type: "ml" as const })),
    ...shopifyStores.map((s) => ({ id: s.id, label: `Shopify: ${s.name ?? s.id}`, type: "shopify" as const })),
  ]

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Candidatos de Publicación</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Productos evaluados por el motor de estrategia de publicación. Solo lectura.
        </p>
      </div>

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4"><Skeleton className="h-10 w-full" /></Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Package className="h-3.5 w-3.5" />
              Productos activos
            </div>
            <div className="text-2xl font-bold">{summary.total_products}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Elegibles
            </div>
            <div className="text-2xl font-bold text-green-600">{summary.eligible_products}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Margen prom. elegibles
            </div>
            <div className="text-2xl font-bold">
              {summary.avg_margin_eligible != null ? `${summary.avg_margin_eligible}%` : "—"}
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-blue-500 text-xs mb-1">
              <Layers className="h-3.5 w-3.5" />
              Dual supplier
            </div>
            <div className="text-2xl font-bold">{summary.dual_supplier_products}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-amber-500 text-xs mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Bloq. margen bajo
            </div>
            <div className="text-2xl font-bold text-amber-500">{summary.blocked_low_margin}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-red-500 text-xs mb-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              Bloq. stock bajo
            </div>
            <div className="text-2xl font-bold text-red-500">{summary.blocked_low_stock}</div>
          </Card>
        </div>
      ) : null}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Store selector */}
          <div className="space-y-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground">Tienda / Cuenta</label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar tienda..." />
              </SelectTrigger>
              <SelectContent>
                {allStores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Channel filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Canal</label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ml">ML</SelectItem>
                <SelectItem value="shopify">Shopify</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Margin filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Margen mín. %</label>
            <Input
              type="number"
              placeholder="0"
              value={minMargin}
              onChange={(e) => setMinMargin(e.target.value)}
              className="w-[100px]"
            />
          </div>

          {/* Only eligible toggle */}
          <Button
            variant={onlyEligible ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyEligible(!onlyEligible)}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Solo elegibles
          </Button>

          {/* Refresh */}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Actualizar"}
          </Button>

          {/* Count */}
          <span className="text-sm text-muted-foreground ml-auto">
            {total} producto{total !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>

      {/* Table */}
      {loading && items.length === 0 ? (
        <Card className="p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center">
          <XCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No hay productos elegibles con los filtros actuales.</p>
        </Card>
      ) : (
        <Card className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">EAN</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Editorial</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Margen %</TableHead>
                <TableHead>Proveedores</TableHead>
                <TableHead className="text-right">Confianza</TableHead>
                <TableHead>Elegible</TableHead>
                <TableHead>Razón</TableHead>
                <TableHead className="text-right">Prioridad</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const sources = supplierSourceKeys(item.supplier_sources)
                const dual = hasDualSupplier(item.supplier_sources)

                return (
                  <TableRow key={item.product_id}>
                    {/* EAN */}
                    <TableCell className="font-mono text-xs">{item.ean ?? "—"}</TableCell>

                    {/* Title */}
                    <TableCell className="max-w-[250px] truncate" title={item.title ?? ""}>
                      {item.title ?? "Sin título"}
                    </TableCell>

                    {/* Publisher */}
                    <TableCell className="text-sm">{item.publisher ?? "—"}</TableCell>

                    {/* Stock */}
                    <TableCell className="text-right font-mono">{item.warehouse_stock}</TableCell>

                    {/* Margin */}
                    <TableCell className="text-right">
                      {item.margin_percent != null ? (
                        <span
                          className={
                            item.margin_percent < 15
                              ? "text-amber-500 font-medium"
                              : item.margin_percent >= 30
                                ? "text-green-500 font-medium"
                                : ""
                          }
                        >
                          {item.margin_percent.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {item.margin_percent != null && item.margin_percent < 15 && (
                        <AlertTriangle className="h-3 w-3 text-amber-500 inline ml-1" />
                      )}
                    </TableCell>

                    {/* Supplier sources */}
                    <TableCell>
                      <div className="flex gap-1 items-center">
                        {sources.map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">
                            {s}
                          </Badge>
                        ))}
                        {dual && (
                          <span title="Dual supplier"><Layers className="h-3.5 w-3.5 text-blue-500 ml-0.5" /></span>
                        )}
                      </div>
                    </TableCell>

                    {/* Confidence */}
                    <TableCell className="text-right font-mono text-sm">
                      {item.supplier_confidence_score != null
                        ? (item.supplier_confidence_score * 100).toFixed(0) + "%"
                        : "—"}
                    </TableCell>

                    {/* Eligible badge */}
                    <TableCell>
                      {item.eligibility.eligible ? (
                        <Badge className="bg-green-500/15 text-green-600 border-green-500/25 hover:bg-green-500/20">
                          <CheckCircle2 className="h-3 w-3 mr-0.5" />
                          Sí
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-muted-foreground">
                          <XCircle className="h-3 w-3 mr-0.5" />
                          No
                        </Badge>
                      )}
                    </TableCell>

                    {/* Reason */}
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={item.eligibility.reason}>
                      {item.eligibility.reason}
                    </TableCell>

                    {/* Priority score */}
                    <TableCell className="text-right font-mono font-medium">
                      {item.eligibility.priority_score.toFixed(2)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/inventory?search=${item.ean ?? item.product_id}`}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                Página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
