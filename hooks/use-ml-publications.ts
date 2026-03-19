"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import type {
  Publication,
  Account,
  Counts,
  DuplicateGroup,
  ImportProgress,
  HistorialData,
} from "@/components/mercadolibre/publications/types"
import { PAGE_SIZE } from "@/components/mercadolibre/publications/types"

export function useMlPublications() {
  const { toast } = useToast()

  // ── Core state ──────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch] = useState<string>("")
  const [sinProducto, setSinProducto] = useState(false)
  const [soloElegibles, setSoloElegibles] = useState(false)
  const [sinStock, setSinStock] = useState(false)
  const [stockFirst, setStockFirst] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [syncingML, setSyncingML] = useState(false)
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<Publication[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  const [detail, setDetail] = useState<Publication | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)
  const [enqueueing, setEnqueueing] = useState<string | null>(null)
  const [weightSync, setWeightSync] = useState<{
    loading: boolean
    result: { updated: number; missing: number; processed: number } | null
  }>({ loading: false, result: null })
  const [skuBackfill, setSkuBackfill] = useState<{
    loading: boolean
    result: { updated: number; skipped: number; processed: number } | null
  }>({ loading: false, result: null })
  const [verifying, setVerifying] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchEnqueueing, setBatchEnqueueing] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [loadingDuplicates, setLoadingDuplicates] = useState(false)
  const [closingItem, setClosingItem] = useState<string | null>(null)
  const [mlStats, setMlStats] = useState<Record<string, { sold_quantity: number; listing_type_id: string | null }>>({})

  // ── Historial de stock ──────────────────────────────────────────────────
  const [historialItem, setHistorialItem] = useState<Publication | null>(null)
  const [historialLoading, setHistorialLoading] = useState(false)
  const [historialData, setHistorialData] = useState<HistorialData | null>(null)

  const searchRef = useRef(search)
  searchRef.current = search

  // ── Historial: fetch al abrir el modal ────────────────────────────────
  const openHistorial = useCallback(async (pub: Publication) => {
    setHistorialItem(pub)
    setHistorialData(null)
    setHistorialLoading(true)
    try {
      const params = new URLSearchParams()
      if (pub.account_id) params.set("account_id", pub.account_id)
      const res = await fetch(`/api/mercadolibre/publications/${pub.ml_item_id}/history?${params}`)
      if (res.ok) {
        const data = await res.json()
        setHistorialData(data)
      }
    } catch {
      // silencioso - el modal muestra estado vacio
    } finally {
      setHistorialLoading(false)
    }
  }, [])

  // ── Load accounts ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/mercadolibre/accounts")
      .then((r) => r.json())
      .then((d) => {
        if (d.accounts) setAccounts(d.accounts)
      })
      .catch(() => {})
  }, [])

  // ── Load status counts (badge query) ──────────────────────────────────
  const loadCounts = useCallback(async (accId: string, searchQ?: string) => {
    setCountsLoading(true)
    try {
      const params = new URLSearchParams({ counts_only: "1" })
      if (accId !== "all") params.set("account_id", accId)
      if (searchQ?.trim()) params.set("q", searchQ.trim())
      const res = await fetch(`/api/ml/publications?${params}`)
      const data = await res.json()
      if (data.ok) setCounts(data.counts)
    } catch {
      /* silent */
    } finally {
      setCountsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCounts(accountId)
  }, [accountId, loadCounts])

  // ── Load import progress from ml_import_progress ──────────────────────
  useEffect(() => {
    if (accountId === "all") {
      setImportProgress(null)
      return
    }
    fetch(`/api/ml/publications/import-progress?account_id=${accountId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.progress) setImportProgress(d.progress)
      })
      .catch(() => {})
  }, [accountId])

  // ── Batch opt-in ─────────────────────────────────────────────────────
  const batchOptIn = async () => {
    if (selected.size === 0 || accountId === "all") return
    setBatchEnqueueing(true)
    let ok = 0
    let err = 0
    for (const ml_item_id of selected) {
      try {
        const pub = rows.find((r) => r.ml_item_id === ml_item_id)
        if (!pub) continue
        const res = await fetch("/api/ml/jobs/enqueue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: accountId,
            type: "catalog_optin",
            payload: { item_id: ml_item_id, account_id: accountId },
          }),
        })
        const data = await res.json()
        if (data.ok) ok++
        else err++
      } catch {
        err++
      }
    }
    toast({
      title: `${ok} jobs encolados`,
      description: err > 0 ? `${err} errores al encolar` : "Todos encolados correctamente",
      variant: err > 0 ? "destructive" : "default",
    })
    setSelected(new Set())
    setBatchEnqueueing(false)
  }

  const toggleSelect = (ml_item_id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(ml_item_id)) next.delete(ml_item_id)
      else next.add(ml_item_id)
      return next
    })
  }

  const selectAllEligible = () => {
    const eligible = rows.filter((r) => r.catalog_listing_eligible && !r.catalog_listing).map((r) => r.ml_item_id)
    setSelected(new Set(eligible))
  }

  // ── Load rows ──────────────────────────────────────────────────────────
  const load = useCallback(
    async (p = 0) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(PAGE_SIZE),
          ...(accountId !== "all" ? { account_id: accountId } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          ...(searchRef.current ? { q: searchRef.current } : {}),
          ...(sinProducto ? { sin_producto: "1" } : {}),
          ...(soloElegibles ? { solo_elegibles: "1" } : {}),
          ...(sinStock ? { sin_stock: "1" } : {}),
          ...(stockFirst ? { stock_first: "1" } : {}),
        })
        const res = await fetch(`/api/ml/publications?${params}`)
        const data = await res.json()
        if (data.ok) {
          setRows(data.rows)
          setTotal(data.total)
        }
      } finally {
        setLoading(false)
      }
    },
    [accountId, statusFilter, sinProducto, soloElegibles, sinStock, stockFirst],
  )

  useEffect(() => {
    setPage(0)
    setSelected(new Set())
    load(0)
    loadCounts(accountId)
  }, [accountId, statusFilter, sinProducto, soloElegibles, sinStock, stockFirst])

  const handleSearch = () => {
    setPage(0)
    load(0)
    loadCounts(accountId, search)
  }
  const prevPage = () => {
    const p = page - 1
    setPage(p)
    load(p)
  }
  const nextPage = () => {
    const p = page + 1
    setPage(p)
    load(p)
  }
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  const copyLink = (permalink: string, id: string) => {
    navigator.clipboard.writeText(permalink)
    setCopiedLink(id)
    setTimeout(() => setCopiedLink(null), 1500)
    toast({ title: "Copiado", description: permalink })
  }

  const handleRefresh = () => {
    load(page)
    loadCounts(accountId, search)
  }

  const loadDuplicates = async () => {
    if (accountId === "all") {
      toast({
        title: "Selecciona una cuenta",
        description: "Elegi una cuenta para buscar duplicados.",
        variant: "destructive",
      })
      return
    }
    setLoadingDuplicates(true)
    setShowDuplicates(true)
    try {
      const res = await fetch(`/api/ml/publications/duplicates?account_id=${accountId}`)
      const data = await res.json()
      if (data.ok) {
        setDuplicateGroups(data.groups)
        setMlStats(data.ml_stats ?? {})
      } else {
        toast({ title: "Error al buscar duplicados", description: data.error, variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    } finally {
      setLoadingDuplicates(false)
    }
  }

  const closePub = async (pub: Publication) => {
    if (
      !confirm(
        `\u00bfEliminar ${pub.ml_item_id} en MercadoLibre?\n\nEsto cierra la publicacion en ML. Para que desaparezca del panel, despues podes reimportar o sincronizar.`,
      )
    )
      return
    setClosingItem(pub.ml_item_id)
    try {
      const res = await fetch("/api/ml/publications/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ml_item_id: pub.ml_item_id, account_id: pub.account_id }),
      })
      const data = await res.json()
      if (data.ok) {
        toast({
          title: "Publicacion eliminada en ML",
          description: `${pub.ml_item_id} cerrada en MercadoLibre. Recargando duplicados...`,
        })
        loadDuplicates()
        loadCounts(accountId)
      } else {
        toast({ title: "Error al cerrar", description: data.error ?? "Error desconocido", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    } finally {
      setClosingItem(null)
    }
  }

  const enqueueJob = async (pub: Publication, type: "catalog_optin" | "buybox_sync" | "import_single_item") => {
    const key = `${pub.ml_item_id}:${type}`
    setEnqueueing(key)
    try {
      const res = await fetch("/api/ml/jobs/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: pub.account_id,
          type,
          payload: { item_id: pub.ml_item_id, account_id: pub.account_id },
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast({ title: "Job agregado a la cola", description: `${pub.ml_item_id} \u2192 ${type}` })
        load(page)
      } else {
        toast({ title: "Error al encolar", description: data.error ?? "Error desconocido", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    } finally {
      setEnqueueing(null)
    }
  }

  const verifyItem = async (pub: Publication) => {
    setVerifying(pub.ml_item_id)
    try {
      const res = await fetch("/api/ml/jobs/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: pub.account_id,
          type: "import_single_item",
          payload: { item_id: pub.ml_item_id, account_id: pub.account_id },
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast({ title: "Verificacion encolada", description: `${pub.ml_item_id} se actualizara en el proximo ciclo.` })
      } else {
        toast({ title: "Error al verificar", description: data.error ?? "Error desconocido", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    } finally {
      setVerifying(null)
    }
  }

  const syncWeights = async () => {
    if (accountId === "all") {
      toast({
        title: "Selecciona una cuenta",
        description: "Elegi una cuenta antes de sincronizar pesos.",
        variant: "destructive",
      })
      return
    }
    setWeightSync({ loading: true, result: null })
    try {
      const res = await fetch("/api/ml/publications/sync-weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, batch_size: 100 }),
      })
      const data = await res.json()
      if (data.ok) {
        setWeightSync({
          loading: false,
          result: { updated: data.updated, missing: data.missing, processed: data.processed },
        })
        toast({
          title: "Sincronizacion completada",
          description: `${data.updated} pesos actualizados, ${data.missing} sin peso en ML.`,
        })
        load(page)
      } else {
        setWeightSync({ loading: false, result: null })
        toast({ title: "Error al sincronizar", description: data.error ?? "Error desconocido", variant: "destructive" })
      }
    } catch (err: any) {
      setWeightSync({ loading: false, result: null })
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    }
  }

  const backfillSku = async () => {
    if (accountId === "all") {
      toast({
        title: "Selecciona una cuenta",
        description: "Elegi una cuenta antes de hacer backfill.",
        variant: "destructive",
      })
      return
    }
    setSkuBackfill({ loading: true, result: null })
    try {
      const res = await fetch("/api/ml/publications/backfill-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, batch_size: 100 }),
      })
      const data = await res.json()
      if (data.ok) {
        setSkuBackfill({
          loading: false,
          result: { updated: data.updated, skipped: data.skipped, processed: data.processed },
        })
        toast({
          title: "Backfill SKU completado",
          description: `${data.updated} actualizados, ${data.skipped} sin SKU en ML.`,
        })
        load(page)
      } else {
        setSkuBackfill({ loading: false, result: null })
        toast({ title: "Error en backfill", description: data.error ?? "Error desconocido", variant: "destructive" })
      }
    } catch (err: any) {
      setSkuBackfill({ loading: false, result: null })
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    }
  }

  const refreshProgress = () => {
    if (accountId === "all") return
    fetch(`/api/ml/publications/import-progress?account_id=${accountId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.progress) setImportProgress(d.progress)
      })
      .catch(() => {})
  }

  const loadMlTotal = useCallback((accId: string) => {
    if (accId === "all") return
    fetch(`/api/ml/publications/import-progress?account_id=${accId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.progress) setImportProgress(d.progress)
      })
      .catch(() => {})
  }, [])

  const syncWithML = async () => {
    if (accountId === "all") {
      toast({ title: "Selecciona una cuenta", variant: "destructive" })
      return
    }
    setSyncingML(true)
    try {
      const res = await fetch("/api/ml/import-pro/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, max_seconds: 12 }),
      })
      const data = await res.json()
      if (data.ok) {
        const desc = `${data.db_rows_upserted ?? data.imported_count} filas persistidas (ML vio ${data.ml_items_seen_count ?? "?"} IDs)${data.has_more ? " \u2014 continua en proxima corrida" : " \u2014 completado"}`
        toast({ title: "Sincronizacion ejecutada", description: desc })
        refreshProgress()
        load(0)
        loadCounts(accountId, search)
        loadMlTotal(accountId)
      } else if (data.rate_limited) {
        toast({
          title: "Rate limit ML",
          description: `Espera ${data.wait_seconds ?? 60}s y reintenta.`,
          variant: "destructive",
        })
      } else {
        toast({ title: "Error al sincronizar", description: data.error ?? "Error desconocido", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    } finally {
      setSyncingML(false)
    }
  }

  return {
    // State
    accounts,
    accountId,
    setAccountId,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    sinProducto,
    setSinProducto,
    soloElegibles,
    setSoloElegibles,
    sinStock,
    setSinStock,
    stockFirst,
    setStockFirst,
    importProgress,
    syncingML,
    page,
    setPage,
    rows,
    total,
    loading,
    copied,
    copiedLink,
    detail,
    setDetail,
    counts,
    countsLoading,
    enqueueing,
    weightSync,
    skuBackfill,
    verifying,
    selected,
    setSelected,
    batchEnqueueing,
    showDuplicates,
    setShowDuplicates,
    duplicateGroups,
    loadingDuplicates,
    closingItem,
    mlStats,
    historialItem,
    setHistorialItem,
    historialLoading,
    historialData,
    totalPages,

    // Actions
    handleSearch,
    prevPage,
    nextPage,
    copyId,
    copyLink,
    handleRefresh,
    loadDuplicates,
    closePub,
    enqueueJob,
    verifyItem,
    syncWeights,
    backfillSku,
    refreshProgress,
    syncWithML,
    batchOptIn,
    toggleSelect,
    selectAllEligible,
    openHistorial,
    load,
  }
}

export type UseMlPublicationsReturn = ReturnType<typeof useMlPublications>
