"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"

interface Warehouse {
  id: string
  name: string
  is_default: boolean
  safety_stock: number
}

interface SourceInfo {
  key: string
  name: string
}

interface Publication {
  ml_item_id: string
  account_id: string
  nickname: string
  status: string
}

interface PublishableProduct {
  id: string
  ean: string | null
  sku: string | null
  title: string | null
  image_url: string | null
  stock_by_source: Record<string, number>
  warehouse_stock: number
  safety_stock: number
  publishable_stock: number
  is_published: boolean
  publications: Publication[]
  reason: string
}

export default function PublishableStockPage() {
  const [loading, setLoading] = useState(true)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState("")
  const [products, setProducts] = useState<PublishableProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [onlyUnpublished, setOnlyUnpublished] = useState(false)
  const [minPublishable, setMinPublishable] = useState(1)
  const [sourceKeys, setSourceKeys] = useState<string[]>([])
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [safetyStock, setSafetyStock] = useState(0)
  const limit = 50

  // Load warehouses on mount
  useEffect(() => {
    fetch("/api/warehouses")
      .then((r) => r.json())
      .then((data) => {
        const whs = data.warehouses || []
        setWarehouses(whs)
        if (whs.length > 0) {
          const def = whs.find((w: Warehouse) => w.is_default)
          setSelectedWarehouse(def?.id || whs[0].id)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const fetchStock = useCallback(async () => {
    if (!selectedWarehouse) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        warehouse_id: selectedWarehouse,
        page: String(page),
        limit: String(limit),
        min_publishable: String(minPublishable),
        only_unpublished: String(onlyUnpublished),
      })
      if (search) params.set("search", search)

      const res = await fetch(`/api/inventory/publishable-stock?${params}`)
      const data = await res.json()

      setProducts(data.products || [])
      setTotal(data.total || 0)
      setSourceKeys(data.source_keys || [])
      setSources(data.sources || [])
      setSafetyStock(data.safety_stock ?? 0)
    } catch {
      setProducts([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [selectedWarehouse, page, limit, search, minPublishable, onlyUnpublished])

  // Debounced fetch on filter changes
  useEffect(() => {
    const t = setTimeout(fetchStock, 300)
    return () => clearTimeout(t)
  }, [fetchStock])

  // Reset page on filter change
  useEffect(() => {
    setPage(1)
  }, [selectedWarehouse, search, minPublishable, onlyUnpublished])

  const totalPages = Math.ceil(total / limit)
  const selectedWh = warehouses.find((w) => w.id === selectedWarehouse)

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/inventory">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Stock Publicable</h1>
          <p className="text-muted-foreground">
            Vista operativa de stock por warehouse, con safety stock y estado de publicación ML
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label>Warehouse</Label>
            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}{w.is_default ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Buscar</Label>
            <Input
              placeholder="EAN, SKU o titulo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Stock publicable min.</Label>
            <Input
              type="number"
              min={0}
              value={minPublishable}
              onChange={(e) => setMinPublishable(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2 flex items-end gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="only-unpub"
                checked={onlyUnpublished}
                onCheckedChange={(c) => setOnlyUnpublished(!!c)}
              />
              <Label htmlFor="only-unpub" className="text-sm">Solo sin publicar en ML</Label>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground flex flex-col justify-end">
            {selectedWh && (
              <>
                <p>Safety stock: <strong>{safetyStock}</strong></p>
                <p>Fuentes: {sources.map((s) => s.name).join(", ") || "—"}</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} productos encontrados
        </p>
        <p className="text-xs text-muted-foreground font-mono">
          publishable = max(0, warehouse_stock - {safetyStock})
        </p>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>EAN</TableHead>
                    <TableHead>Producto</TableHead>
                    {sourceKeys.map((k) => (
                      <TableHead key={k} className="text-right text-xs">{k}</TableHead>
                    ))}
                    <TableHead className="text-right">WH Stock</TableHead>
                    <TableHead className="text-right">Safety</TableHead>
                    <TableHead className="text-right font-semibold">Publicable</TableHead>
                    <TableHead className="text-center">ML</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6 + sourceKeys.length} className="text-center py-8 text-muted-foreground">
                        Sin productos para este warehouse
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.ean ?? "—"}</TableCell>
                        <TableCell>
                          <div className="max-w-[250px] truncate text-sm" title={p.title ?? ""}>
                            {p.title ?? "—"}
                          </div>
                        </TableCell>
                        {sourceKeys.map((k) => (
                          <TableCell key={k} className="text-right font-mono text-xs">
                            {p.stock_by_source[k] ?? 0}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-mono">{p.warehouse_stock}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{p.safety_stock}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          <span className={p.publishable_stock > 0 ? "text-green-600" : "text-red-500"}>
                            {p.publishable_stock}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {p.is_published ? (
                            <div className="space-y-0.5">
                              {p.publications.map((pub) => (
                                <Badge key={pub.ml_item_id} variant="secondary" className="text-xs">
                                  {pub.nickname}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {p.reason && (
                            <Badge variant="outline" className="text-xs">
                              {p.reason === "sin_stock_warehouse" && "Sin stock"}
                              {p.reason === "bajo_safety_stock" && "Bajo safety"}
                              {p.reason === "sin_ean" && "Sin EAN"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
