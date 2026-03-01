"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  RefreshCw,
  Link2,
  Search,
  Unlink,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

interface ShopifyStore {
  id: string
  shop_domain: string
  is_active: boolean
  has_credentials: boolean // true si api_key y api_secret están guardados
}

interface ProductLink {
  id: string
  product_id: string
  store_id: string
  shopify_product_id: number
  shopify_variant_id: number
  shopify_title: string
  shopify_sku: string
  shopify_barcode: string
  shopify_price: number
  shopify_status: string
  shopify_image_url: string | null
  matched_by: string
  matched_value: string
  sync_status: string
  last_synced_at: string | null
  products: {
    id: string
    title: string
    ean: string | null
    isbn: string | null
    sku: string | null
    image_url: string | null
  } | null
}

interface SyncStats {
  total: number
  linked: number
  last_synced_at: string | null
}

interface SyncResult {
  shopify_variants_total: number
  db_products_scanned: number
  matched: number
  matched_ean: number
  matched_isbn: number
  skipped: number
}

export default function ShopifySyncPage() {
  const [stores, setStores]               = useState<ShopifyStore[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>("")
  const [stats, setStats]                 = useState<SyncStats | null>(null)
  const [links, setLinks]                 = useState<ProductLink[]>([])
  const [total, setTotal]                 = useState(0)
  const [page, setPage]                   = useState(0)
  const [q, setQ]                         = useState("")
  const [statusFilter, setStatusFilter]   = useState("")
  const [loadingStores, setLoadingStores] = useState(true)
  const [loadingLinks, setLoadingLinks]   = useState(false)
  const [syncing, setSyncing]             = useState(false)
  const [syncResult, setSyncResult]       = useState<SyncResult | null>(null)
  const [syncError, setSyncError]         = useState<string | null>(null)
  const [apiKey, setApiKey]               = useState("")
  const [apiSecret, setApiSecret]         = useState("")
  const [savingCreds, setSavingCreds]     = useState(false)

  const LIMIT = 50

  // Cargar tiendas
  useEffect(() => {
    fetch("/api/shopify/stores")
      .then(r => r.json())
      .then(d => {
        const list = (d.stores ?? []).map((s: any) => ({
          ...s,
          has_credentials: !!(s.api_key && s.api_secret),
        }))
        setStores(list)
        if (list.length > 0) setSelectedStoreId(list[0].id)
      })
      .finally(() => setLoadingStores(false))
  }, [])

  // Cargar stats cuando cambia la tienda
  const fetchStats = useCallback(async () => {
    if (!selectedStoreId) return
    const res = await fetch(`/api/shopify/sync?store_id=${selectedStoreId}`)
    const d = await res.json()
    if (d.ok) setStats(d)
  }, [selectedStoreId])

  // Cargar vínculos
  const fetchLinks = useCallback(async (p = 0) => {
    if (!selectedStoreId) return
    setLoadingLinks(true)
    const params = new URLSearchParams({
      store_id: selectedStoreId,
      page: String(p),
      limit: String(LIMIT),
    })
    if (q)            params.set("q", q)
    if (statusFilter) params.set("status", statusFilter)
    const res = await fetch(`/api/shopify/links?${params}`)
    const d = await res.json()
    if (d.ok) { setLinks(d.links ?? []); setTotal(d.total ?? 0) }
    setLoadingLinks(false)
  }, [selectedStoreId, q, statusFilter])

  useEffect(() => {
    if (!selectedStoreId) return
    fetchStats()
    setPage(0)
    fetchLinks(0)
  }, [selectedStoreId]) // eslint-disable-line

  // Guardar credenciales y renovar token
  const saveCredentials = async () => {
    if (!selectedStoreId || !apiKey || !apiSecret) return
    setSavingCreds(true); setSyncError(null)
    try {
      const res = await fetch("/api/shopify/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: selectedStoreId, api_key: apiKey, api_secret: apiSecret }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) {
        setSyncError(d.error ?? "Error al guardar credenciales")
      } else {
        // Actualizar el has_credentials de la tienda actual
        setStores(prev => prev.map(s => s.id === selectedStoreId ? { ...s, has_credentials: true } : s))
        setApiKey(""); setApiSecret("")
        setSyncError(null)
      }
    } catch (e: any) {
      setSyncError(e.message)
    } finally {
      setSavingCreds(false)
    }
  }

  const [syncProgress, setSyncProgress] = useState<string | null>(null)

  // Correr sync — lee el stream NDJSON línea a línea para evitar timeouts
  const runSync = async () => {
    if (!selectedStoreId) return
    setSyncing(true); setSyncResult(null); setSyncError(null); setSyncProgress(null)
    try {
      const res = await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: selectedStoreId }),
      })

      if (!res.body) throw new Error("Sin respuesta del servidor")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // Procesar líneas completas
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? "" // última línea incompleta vuelve al buffer
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            if (msg.error) {
              setSyncError(msg.error)
            } else if (msg.ok && msg.phase === "done") {
              setSyncResult(msg)
              setSyncProgress(null)
              fetchStats(); fetchLinks(0); setPage(0)
            } else if (msg.phase === "shopify") {
              setSyncProgress(`Descargando de Shopify... ${msg.variants_fetched ? msg.variants_fetched.toLocaleString("es-AR") + " variantes" : ""}`)
            } else if (msg.phase === "shopify_done") {
              setSyncProgress(`Shopify: ${msg.variants_fetched.toLocaleString("es-AR")} variantes descargadas. Ejecutando vinculación SQL...`)
            } else if (msg.phase === "matching") {
              setSyncProgress("Ejecutando JOIN SQL en base de datos...")
            }
          } catch { /* línea no parseable, ignorar */ }
        }
      }
    } catch (e: any) {
      setSyncError(e.message)
    } finally {
      setSyncing(false)
    }
  }

  // Desvincular
  const unlink = async (link_id: string) => {
    const res = await fetch("/api/shopify/links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link_id }),
    })
    if (res.ok) {
      setLinks(prev => prev.filter(l => l.id !== link_id))
      fetchStats()
    }
  }

  const handleSearch = (v: string) => {
    setQ(v); setPage(0)
  }

  useEffect(() => {
    if (!selectedStoreId) return
    const t = setTimeout(() => fetchLinks(0), 400)
    return () => clearTimeout(t)
  }, [q, statusFilter]) // eslint-disable-line

  const totalPages = Math.ceil(total / LIMIT)

  const matchedByLabel = (by: string) => {
    if (by === "ean_vs_sku")  return "EAN → SKU"
    if (by === "isbn_vs_sku") return "ISBN → SKU"
    return by
  }

  const statusBadge = (status: string) => {
    if (status === "linked")   return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">Vinculado</Badge>
    if (status === "conflict") return <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-xs">Conflicto</Badge>
    return <Badge className="bg-muted text-muted-foreground text-xs">{status}</Badge>
  }

  if (loadingStores) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Cargando tiendas...
      </div>
    )
  }

  if (stores.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        No hay tiendas Shopify conectadas.{" "}
        <a href="/integrations/shopify-stores" className="underline text-foreground">Agregar tienda</a>
      </div>
    )
  }

  const selectedStore = stores.find(s => s.id === selectedStoreId)
  const needsCredentials = selectedStore && !selectedStore.has_credentials

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">

      {/* Aviso: tienda sin credenciales guardadas */}
      {needsCredentials && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-300">Credenciales requeridas</p>
              <p className="text-xs text-yellow-400/80 mt-0.5">
                Esta tienda fue conectada antes de que se guardaran las credenciales. Ingresá la API Key y el API Secret de Shopify una sola vez para que el token se renueve automáticamente.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">API Key (Client ID)</label>
              <Input
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxx"
                className="h-8 text-sm w-64 font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">API Secret (Client Secret)</label>
              <Input
                value={apiSecret}
                onChange={e => setApiSecret(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxx"
                type="password"
                className="h-8 text-sm w-64 font-mono"
              />
            </div>
            <Button
              size="sm"
              onClick={saveCredentials}
              disabled={savingCreds || !apiKey || !apiSecret}
              className="h-8"
            >
              {savingCreds ? "Guardando..." : "Guardar y renovar token"}
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Sincronización de productos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vincula productos de tu base de datos con publicaciones de Shopify via <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">EAN → SKU</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stores.length > 1 && (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-52 h-9 text-sm">
                <SelectValue placeholder="Elegir tienda" />
              </SelectTrigger>
              <SelectContent>
                {stores.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.shop_domain}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex flex-col items-end gap-1">
            <Button onClick={runSync} disabled={syncing || !!needsCredentials} size="sm" className="gap-2" title={needsCredentials ? "Primero guardá las credenciales" : undefined}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar ahora"}
            </Button>
            {syncProgress && (
              <span className="text-xs text-muted-foreground animate-pulse">{syncProgress}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Vinculados</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.linked.toLocaleString("es-AR")}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total vínculos</p>
            <p className="text-2xl font-bold">{stats.total.toLocaleString("es-AR")}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Sin vincular</p>
            <p className="text-2xl font-bold text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground">Correr sync para ver</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Última sync</p>
            <p className="text-sm font-medium">
              {stats.last_synced_at
                ? new Date(stats.last_synced_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
                : "Nunca"}
            </p>
          </div>
        </div>
      )}

      {/* Resultado del último sync */}
      {syncResult && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-emerald-300 mb-1">Sincronización completada</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
              <span>Variantes Shopify: <strong className="text-foreground">{syncResult.shopify_variants_total.toLocaleString("es-AR")}</strong></span>
              <span>Productos DB: <strong className="text-foreground">{syncResult.db_products_scanned.toLocaleString("es-AR")}</strong></span>
              <span>Vinculados: <strong className="text-emerald-400">{syncResult.matched.toLocaleString("es-AR")}</strong></span>
              {syncResult.matched_ean > 0 && <span>por EAN: <strong className="text-foreground">{syncResult.matched_ean.toLocaleString("es-AR")}</strong></span>}
              {syncResult.matched_isbn > 0 && <span>por ISBN: <strong className="text-foreground">{syncResult.matched_isbn.toLocaleString("es-AR")}</strong></span>}
              <span>Sin match: <strong className="text-muted-foreground">{syncResult.skipped.toLocaleString("es-AR")}</strong></span>
            </div>
          </div>
        </div>
      )}

      {syncError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Error en sincronización</p>
            <p className="text-muted-foreground text-xs mt-0.5">{syncError}</p>
          </div>
        </div>
      )}

      {/* Nota aclaratoria del criterio de match */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Link2 className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          El criterio de vinculación es exclusivamente <strong className="text-foreground">EAN de tu base de datos = SKU en Shopify</strong>.
          Si el EAN no matchea, se intenta con ISBN. Ambos se comparan contra el campo SKU de cada variante en Shopify.
          Cada tienda genera vínculos independientes, por lo que un mismo producto puede estar vinculado a dos tiendas distintas.
        </span>
      </div>

      {/* Filtros y tabla de vínculos */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Buscar por título, SKU, EAN..."
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={statusFilter || "all"} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); setPage(0) }}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="linked">Vinculados</SelectItem>
              <SelectItem value="conflict">Con conflicto</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground ml-auto">
            {total.toLocaleString("es-AR")} registros
          </p>
        </div>

        {loadingLinks ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm gap-2">
            <Clock className="h-4 w-4 animate-pulse" /> Cargando vínculos...
          </div>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
            <Link2 className="h-8 w-8 opacity-30" />
            <p>{stats?.total === 0 ? "Aún no hay vínculos. Presioná Sincronizar para empezar." : "Sin resultados para los filtros actuales."}</p>
          </div>
        ) : (
          <>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground w-10"></th>
                    <th className="text-left p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Producto (DB)</th>
                    <th className="text-left p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground hidden md:table-cell">EAN / ISBN</th>
                    <th className="text-left p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Publicación Shopify</th>
                    <th className="text-left p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground hidden lg:table-cell">SKU Shopify</th>
                    <th className="text-left p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground hidden lg:table-cell">Método</th>
                    <th className="text-left p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {links.map(link => (
                    <tr key={link.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      {/* Miniatura */}
                      <td className="p-3">
                        {(link.products?.image_url || link.shopify_image_url) ? (
                          <img
                            src={link.products?.image_url || link.shopify_image_url!}
                            alt=""
                            className="w-8 h-8 rounded object-cover border border-border"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                            <Link2 className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </td>
                      {/* Producto DB */}
                      <td className="p-3">
                        <p className="font-medium text-sm leading-tight line-clamp-2">
                          {link.products?.title ?? <span className="text-muted-foreground italic">Producto eliminado</span>}
                        </p>
                      </td>
                      {/* EAN */}
                      <td className="p-3 hidden md:table-cell">
                        <span className="font-mono text-xs text-muted-foreground">{link.matched_value || "—"}</span>
                      </td>
                      {/* Publicación Shopify */}
                      <td className="p-3">
                        <p className="text-sm leading-tight line-clamp-2">{link.shopify_title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ${Number(link.shopify_price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </p>
                      </td>
                      {/* SKU Shopify */}
                      <td className="p-3 hidden lg:table-cell">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{link.shopify_sku || "—"}</span>
                      </td>
                      {/* Método de match */}
                      <td className="p-3 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">{matchedByLabel(link.matched_by)}</span>
                      </td>
                      {/* Estado */}
                      <td className="p-3">{statusBadge(link.sync_status)}</td>
                      {/* Desvincular */}
                      <td className="p-3">
                        <button
                          onClick={() => unlink(link.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Desvincular"
                        >
                          <Unlink className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <Button
                  variant="outline" size="sm"
                  disabled={page === 0 || loadingLinks}
                  onClick={() => { const p = page - 1; setPage(p); fetchLinks(p) }}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Página {page + 1} de {totalPages}
                </span>
                <Button
                  variant="outline" size="sm"
                  disabled={page >= totalPages - 1 || loadingLinks}
                  onClick={() => { const p = page + 1; setPage(p); fetchLinks(p) }}
                  className="gap-1"
                >
                  Siguiente <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
