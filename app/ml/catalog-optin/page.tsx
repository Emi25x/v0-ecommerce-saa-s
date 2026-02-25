"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

// ── Types ──────────────────────────────────────────────────────────────────

type Pub = {
  id: string
  ml_item_id: string
  title: string
  price: number
  status: string
  ean: string | null
  isbn: string | null
  gtin: string | null
  resolve_status?: "pending" | "resolving" | "resolved" | "ambiguous" | "not_found" | "no_ean"
  catalog_product_id?: string | null
  product_title?: string | null
  ambiguous_options?: { id: string; name: string }[]
  optin_status?: "pending" | "running" | "ok" | "failed" | "dry"
  optin_error?: string
}

type LogLine = { ts: string; msg: string; type: "info" | "ok" | "error" | "warn" }

const MAX_LOG = 300

// ── Component ──────────────────────────────────────────────────────────────

export default function CatalogOptinPage() {
  const [accounts, setAccounts]         = useState<any[]>([])
  const [accountId, setAccountId]       = useState("")
  const [pubs, setPubs]                 = useState<Pub[]>([])
  const [total, setTotal]               = useState(0)
  const [loading, setLoading]           = useState(false)
  const [running, setRunning]           = useState(false)
  const [dryRun, setDryRun]             = useState(true)
  const [confirmLive, setConfirmLive]   = useState(false)
  const [logs, setLogs]                 = useState<LogLine[]>([])
  const [filter, setFilter]             = useState<"all" | "resolved" | "not_found" | "ambiguous" | "no_ean">("all")
  // Selección
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  // Modo masivo: no lista pubs, procesa todo en servidor paginando
  const [bulkMode, setBulkMode]         = useState(false)
  const abortRef  = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // ── Helpers ──────────────────────────────────────────────────────────────

  const addLog = useCallback((msg: string, type: LogLine["type"] = "info") => {
    const ts = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    setLogs(prev => {
      const next = [...prev, { ts, msg, type }]
      return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next
    })
  }, [])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [logs])

  const getEan = (p: Pub) => p.gtin || p.ean || p.isbn || null

  // ── Load accounts ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/ml/accounts")
      .then(r => r.json())
      .then(d => {
        const accs = d.accounts ?? []
        setAccounts(accs)
        const saved = typeof window !== "undefined" ? localStorage.getItem("ml_selected_account") : null
        const match = saved && accs.find((a: any) => a.id === saved)
        const sel = match ? match.id : accs[0]?.id ?? ""
        setAccountId(sel)
      })
  }, [])

  // ── Load publications (solo en modo manual) ───────────────────────────────

  const loadPubs = useCallback(async () => {
    if (!accountId || bulkMode) return
    setLoading(true)
    setPubs([])
    setSelected(new Set())
    addLog("Cargando publicaciones...")
    try {
      const res = await fetch(`/api/ml/catalog-optin?account_id=${accountId}&limit=500`)
      const data = await res.json()
      if (!data.ok) { addLog(`Error al cargar: ${data.error}`, "error"); return }
      const enriched: Pub[] = (data.pubs ?? []).map((p: Pub) => ({
        ...p,
        resolve_status: getEan(p) ? "pending" : "no_ean",
      }))
      setPubs(enriched)
      setTotal(data.total ?? 0)
      addLog(`${enriched.length} publicaciones cargadas (${data.total} totales con EAN)`, "ok")
    } finally {
      setLoading(false)
    }
  }, [accountId, bulkMode, addLog])

  useEffect(() => {
    if (accountId && !bulkMode) loadPubs()
    if (bulkMode) { setPubs([]); setSelected(new Set()) }
  }, [accountId, bulkMode])

  // ── Selección ─────────────────────────────────────────────────────────────

  const filteredPubs = pubs.filter(p => {
    if (filter === "all")       return true
    if (filter === "resolved")  return p.resolve_status === "resolved"
    if (filter === "not_found") return p.resolve_status === "not_found"
    if (filter === "ambiguous") return p.resolve_status === "ambiguous"
    if (filter === "no_ean")    return p.resolve_status === "no_ean"
    return true
  })

  const visibleIds = filteredPubs.slice(0, 500).map(p => p.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
  const someVisibleSelected = visibleIds.some(id => selected.has(id))

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const selectAllResolved = () => {
    const ids = pubs.filter(p => p.resolve_status === "resolved" && p.catalog_product_id).map(p => p.id)
    setSelected(new Set(ids))
    addLog(`${ids.length} items resueltos seleccionados`, "info")
  }

  // ── Resolve ───────────────────────────────────────────────────────────────

  const resolveAll = useCallback(async () => {
    if (!accountId || running) return
    setRunning(true)
    abortRef.current = false
    // Resolver solo los seleccionados si hay seleccion, si no todos pendientes
    const toResolve = selected.size > 0
      ? pubs.filter(p => selected.has(p.id) && p.resolve_status === "pending")
      : pubs.filter(p => p.resolve_status === "pending")
    addLog(`Resolviendo ${toResolve.length} EANs${selected.size > 0 ? " (seleccionados)" : ""}...`)
    let ok = 0, notFound = 0, ambiguous = 0, errors = 0

    for (const pub of toResolve) {
      if (abortRef.current) break
      const ean = getEan(pub)
      if (!ean) continue
      setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, resolve_status: "resolving" } : p))

      const res = await fetch("/api/ml/catalog-optin/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, ean }),
      }).catch(() => null)
      const data = await res?.json().catch(() => ({}))

      if (data?.status === "resolved") {
        setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, resolve_status: "resolved", catalog_product_id: data.catalog_product_id, product_title: data.product_title } : p))
        ok++
      } else if (data?.status === "ambiguous") {
        setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, resolve_status: "ambiguous", ambiguous_options: data.results } : p))
        ambiguous++
      } else {
        setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, resolve_status: "not_found" } : p))
        data?.status === "not_found" ? notFound++ : errors++
      }
      await new Promise(r => setTimeout(r, 200))
    }

    addLog(`Resolucion: ${ok} resueltos | ${notFound} sin match | ${ambiguous} ambiguos | ${errors} errores`, ok > 0 ? "ok" : "warn")
    setRunning(false)
  }, [accountId, pubs, selected, running, addLog])

  // ── Resolver + Optin en un solo paso ──────────────────────────────────────

  const resolveAndOptin = useCallback(async () => {
    if (!accountId || running) return
    if (!dryRun && !confirmLive) { addLog("Confirma LIVE antes de ejecutar", "warn"); return }
    setRunning(true)
    abortRef.current = false

    const targets = selected.size > 0
      ? pubs.filter(p => selected.has(p.id) && p.resolve_status !== "no_ean")
      : pubs.filter(p => p.resolve_status !== "no_ean")

    addLog(`Resolver + Optin ${dryRun ? "DRY RUN" : "LIVE"} sobre ${targets.length} items...`)
    let okOptin = 0, failedOptin = 0, noMatch = 0, errors = 0

    for (const pub of targets) {
      if (abortRef.current) break

      // Paso 1: resolver si no está ya resuelto
      let resolvedId = pub.catalog_product_id ?? null
      if (pub.resolve_status !== "resolved" || !resolvedId) {
        const ean = getEan(pub)
        if (!ean) continue
        setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, resolve_status: "resolving" } : p))
        const rRes = await fetch("/api/ml/catalog-optin/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId, ean }),
        }).catch(() => null)
        const rData = await rRes?.json().catch(() => ({}))

        if (rData?.status === "resolved") {
          resolvedId = rData.catalog_product_id
          setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, resolve_status: "resolved", catalog_product_id: resolvedId, product_title: rData.product_title } : p))
        } else if (rData?.status === "ambiguous") {
          setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, resolve_status: "ambiguous", ambiguous_options: rData.results } : p))
          addLog(`Ambiguo: ${pub.ml_item_id} — elegir manualmente`, "warn")
          continue
        } else {
          setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, resolve_status: "not_found" } : p))
          noMatch++
          continue
        }
        await new Promise(r => setTimeout(r, 200))
      }

      if (!resolvedId) { noMatch++; continue }

      // Paso 2: optin
      setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, optin_status: "running" } : p))
      const oRes = await fetch("/api/ml/catalog-optin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, item_id: pub.ml_item_id, catalog_product_id: resolvedId, dry_run: dryRun }),
      }).catch(() => null)
      const oData = await oRes?.json().catch(() => ({}))

      if (dryRun || oData?.ok) {
        setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, optin_status: dryRun ? "dry" : "ok" } : p))
        okOptin++
        if (!dryRun) addLog(`OK: ${pub.ml_item_id} → ${resolvedId}`, "ok")
      } else {
        const errMsg = oData?.ml_error?.message ?? oData?.ml_error?.error ?? JSON.stringify(oData?.ml_error ?? {})
        setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, optin_status: "failed", optin_error: errMsg } : p))
        failedOptin++
        addLog(`FAIL: ${pub.ml_item_id} — ${errMsg}`, "error")
      }
      await new Promise(r => setTimeout(r, 300))
    }

    addLog(
      `Listo ${dryRun ? "(DRY RUN)" : "(LIVE)"}: ${okOptin} optin ok | ${failedOptin} fallidos | ${noMatch} sin match`,
      failedOptin > 0 ? "warn" : "ok"
    )
    setRunning(false)
  }, [accountId, pubs, selected, dryRun, confirmLive, running, addLog])

  // ── Optin manual (sobre seleccionados o todos resueltos) ──────────────────

  const runOptin = useCallback(async () => {
    if (!accountId || running) return
    if (!dryRun && !confirmLive) { addLog("Confirma LIVE antes de ejecutar", "warn"); return }
    setRunning(true)
    abortRef.current = false

    const toOptin = selected.size > 0
      ? pubs.filter(p => selected.has(p.id) && p.resolve_status === "resolved" && p.catalog_product_id && p.optin_status !== "ok")
      : pubs.filter(p => p.resolve_status === "resolved" && p.catalog_product_id && p.optin_status !== "ok")

    addLog(`Optin ${dryRun ? "DRY RUN" : "LIVE"} sobre ${toOptin.length} items${selected.size > 0 ? " (seleccionados)" : ""}...`)
    let ok = 0, failed = 0

    for (const pub of toOptin) {
      if (abortRef.current) break
      setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, optin_status: "running" } : p))

      const res = await fetch("/api/ml/catalog-optin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, item_id: pub.ml_item_id, catalog_product_id: pub.catalog_product_id, dry_run: dryRun }),
      }).catch(() => null)
      const data = await res?.json().catch(() => ({}))

      if (dryRun || data?.ok) {
        setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, optin_status: dryRun ? "dry" : "ok" } : p))
        ok++
        if (!dryRun) addLog(`OK: ${pub.ml_item_id} → ${pub.catalog_product_id}`, "ok")
      } else {
        const errMsg = data?.ml_error?.message ?? data?.ml_error?.error ?? JSON.stringify(data?.ml_error ?? {})
        setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, optin_status: "failed", optin_error: errMsg } : p))
        failed++
        addLog(`FAIL: ${pub.ml_item_id} — ${errMsg}`, "error")
      }
      await new Promise(r => setTimeout(r, 300))
    }

    addLog(`Optin ${dryRun ? "DRY RUN" : "LIVE"} completo: ${ok} ok | ${failed} fallidos`, failed > 0 ? "warn" : "ok")
    setRunning(false)
  }, [accountId, pubs, selected, dryRun, confirmLive, running, addLog])

  // ── Optin masivo (loop de batches desde el cliente) ───────────────────────

  const runBulkOptin = useCallback(async () => {
    if (!accountId || running) return
    if (!dryRun && !confirmLive) { addLog("Confirma LIVE antes de ejecutar en masivo", "warn"); return }
    setRunning(true)
    abortRef.current = false

    addLog(`Iniciando optin masivo ${dryRun ? "DRY RUN" : "LIVE"}...`)

    let offset = 0
    let totalPubs = 0
    let accOk = 0, accFailed = 0, accNoMatch = 0, accNoEan = 0
    let batchNum = 0
    let done = false

    while (!done) {
      if (abortRef.current) { addLog("Detenido por el usuario.", "warn"); break }

      batchNum++
      const res = await fetch("/api/ml/catalog-optin/bulk/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, dry_run: dryRun, offset }),
      }).catch(() => null)

      if (!res) { addLog(`Error de red en batch ${batchNum}`, "error"); break }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        addLog(`Error HTTP ${res.status} en batch ${batchNum}: ${errData.error ?? "desconocido"}`, "error")
        break
      }

      const data = await res.json().catch(() => ({}))
      if (!data.ok) { addLog(`Error en batch ${batchNum}: ${data.error ?? "desconocido"}`, "error"); break }

      accOk      += data.ok_count      ?? 0
      accFailed  += data.failed_count  ?? 0
      accNoMatch += data.no_match_count ?? 0
      accNoEan   += data.no_ean_count   ?? 0
      offset      = data.offset ?? offset + (data.batch_size ?? 20)
      totalPubs   = data.total  ?? totalPubs
      done        = data.done === true

      const pct = totalPubs > 0 ? Math.min(99, Math.round((offset / totalPubs) * 100)) : 0
      addLog(
        `Batch ${batchNum}: +${data.ok_count} ok | +${data.no_match_count} sin match | +${data.failed_count} fallidos | ${offset.toLocaleString()}/${totalPubs.toLocaleString()} (${pct}%)`,
        data.failed_count > 0 ? "warn" : "info"
      )

      if (!done) await new Promise(r => setTimeout(r, 300))
    }

    addLog(
      `Masivo ${dryRun ? "DRY RUN" : "LIVE"} completo: ${accOk} ok | ${accFailed} fallidos | ${accNoMatch} sin match | ${accNoEan} sin EAN en ${batchNum} batches`,
      accFailed > 0 ? "warn" : "ok"
    )
    setRunning(false)
  }, [accountId, dryRun, confirmLive, running, addLog])

  // ── Derived counts ─────────────────────────────────────────────────────────

  const counts = {
    total:      pubs.length,
    pending:    pubs.filter(p => p.resolve_status === "pending").length,
    resolved:   pubs.filter(p => p.resolve_status === "resolved").length,
    not_found:  pubs.filter(p => p.resolve_status === "not_found").length,
    ambiguous:  pubs.filter(p => p.resolve_status === "ambiguous").length,
    no_ean:     pubs.filter(p => p.resolve_status === "no_ean").length,
    optin_ok:   pubs.filter(p => p.optin_status === "ok").length,
    optin_fail: pubs.filter(p => p.optin_status === "failed").length,
  }

  const resolvedPct = counts.total > 0
    ? Math.round(((counts.resolved + counts.not_found + counts.no_ean + counts.ambiguous) / counts.total) * 100)
    : 0

  const selectedResolved = pubs.filter(p => selected.has(p.id) && p.resolve_status === "resolved" && p.catalog_product_id).length
  const optinTarget = selected.size > 0 ? selectedResolved : counts.resolved

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex flex-col gap-6 p-6 max-w-6xl mx-auto font-sans">

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">Optin a Catalogo ML</h1>
        <p className="text-sm text-muted-foreground">
          Vincula publicaciones tradicionales existentes al catalogo de ML. Actua sobre publicaciones activas o pausadas con EAN, ISBN o GTIN.
        </p>
      </div>

      {/* Selectors + modo */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Cuenta ML</label>
          <select
            value={accountId}
            onChange={e => {
              setAccountId(e.target.value)
              localStorage.setItem("ml_selected_account", e.target.value)
            }}
            disabled={running}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname}</option>)}
          </select>
        </div>

        {/* Toggle modo */}
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          <button
            onClick={() => setBulkMode(false)}
            className={`px-3 py-2 transition-colors ${!bulkMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Manual (lista)
          </button>
          <button
            onClick={() => setBulkMode(true)}
            className={`px-3 py-2 border-l border-border transition-colors ${bulkMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Masivo (sin listar)
          </button>
        </div>

        {!bulkMode && (
          <Button onClick={loadPubs} disabled={loading || running} variant="outline" size="sm">
            {loading ? "Cargando..." : "Recargar"}
          </Button>
        )}
      </div>

      {/* ── MODO MASIVO ───────────────────────────────────────────────────── */}
      {bulkMode && (
        <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">Optin masivo de toda la cuenta</p>
            <p className="text-xs text-muted-foreground">
              Procesa todas las publicaciones con EAN directamente en el servidor (sin cargarlas aqui). Resuelve cada EAN contra ML Products y aplica optin en lotes. Puede tardar varios minutos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={e => { setDryRun(e.target.checked); setConfirmLive(false) }}
                disabled={running}
                className="rounded border-input"
              />
              Modo DRY (simular, no aplica cambios)
            </label>
            {!dryRun && (
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-orange-400">
                <input
                  type="checkbox"
                  checked={confirmLive}
                  onChange={e => setConfirmLive(e.target.checked)}
                  disabled={running}
                  className="rounded border-input"
                />
                Confirmo ejecucion LIVE
              </label>
            )}
            <Button
              onClick={runBulkOptin}
              disabled={running || (!dryRun && !confirmLive)}
              size="sm"
              className={dryRun ? "" : "bg-orange-600 hover:bg-orange-700 text-white"}
            >
              {running ? "Procesando..." : dryRun ? "Simular optin masivo" : "Optin masivo LIVE"}
            </Button>
            {running && (
              <Button onClick={() => { abortRef.current = true; setRunning(false) }} variant="destructive" size="sm">
                Detener
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── MODO MANUAL ───────────────────────────────────────────────────── */}
      {!bulkMode && (
        <>
          {/* Summary cards */}
          {pubs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {[
                { label: "Total",     val: counts.total,      color: "text-foreground" },
                { label: "Pendiente", val: counts.pending,    color: "text-zinc-400" },
                { label: "Resueltos", val: counts.resolved,   color: "text-blue-400" },
                { label: "Sin match", val: counts.not_found,  color: "text-orange-400" },
                { label: "Ambiguos",  val: counts.ambiguous,  color: "text-yellow-400" },
                { label: "Sin EAN",   val: counts.no_ean,     color: "text-zinc-600" },
                { label: "Optin OK",  val: counts.optin_ok,   color: "text-green-400" },
                { label: "Fallidos",  val: counts.optin_fail, color: "text-red-400" },
              ].map(({ label, val, color }) => (
                <div key={label} className="flex flex-col items-center rounded-md border border-border bg-card p-2">
                  <span className={`text-xl font-semibold tabular-nums ${color}`}>{val.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground leading-tight mt-0.5">{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Progress */}
          {pubs.length > 0 && counts.pending < counts.total && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progreso de resolucion</span>
                <span>{resolvedPct}%</span>
              </div>
              <Progress value={resolvedPct} className="h-1.5" />
            </div>
          )}

          {/* Barra de seleccion */}
          {pubs.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {selected.size > 0 ? `${selected.size} seleccionados` : "Sin seleccion (aplica a todos)"}
              </span>
              <button onClick={selectAllResolved} className="hover:text-foreground underline underline-offset-2">
                Seleccionar todos los resueltos ({counts.resolved})
              </button>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="hover:text-foreground underline underline-offset-2">
                  Limpiar seleccion
                </button>
              )}
            </div>
          )}

          {/* Action buttons */}
          {pubs.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/10 px-4 py-3">

              {/* Modo DRY / LIVE */}
              <div className="flex items-center gap-3 mr-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={e => { setDryRun(e.target.checked); setConfirmLive(false) }}
                    disabled={running}
                    className="rounded border-input"
                  />
                  Modo DRY (simular)
                </label>
                {!dryRun && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-orange-400">
                    <input
                      type="checkbox"
                      checked={confirmLive}
                      onChange={e => setConfirmLive(e.target.checked)}
                      disabled={running}
                      className="rounded border-input"
                    />
                    Confirmo LIVE
                  </label>
                )}
              </div>

              {/* Boton principal: resolver + optin en un paso */}
              {(() => {
                const mainCount = selected.size > 0
                  ? pubs.filter(p => selected.has(p.id) && p.resolve_status !== "no_ean").length
                  : pubs.filter(p => p.resolve_status !== "no_ean").length
                return (
                  <Button
                    onClick={resolveAndOptin}
                    disabled={running || mainCount === 0 || (!dryRun && !confirmLive)}
                    size="sm"
                    className={dryRun ? "" : "bg-orange-600 hover:bg-orange-700 text-white"}
                  >
                    {running ? "Procesando..." : dryRun
                      ? `Simular (${mainCount}${selected.size > 0 ? " selec." : ""})`
                      : `Resolver y hacer Optin LIVE (${mainCount}${selected.size > 0 ? " selec." : ""})`}
                  </Button>
                )
              })()}

              {/* Separador */}
              <span className="text-muted-foreground/40 text-xs">|</span>

              {/* Solo resolver (sin optin) */}
              {(() => {
                const pendingCount = selected.size > 0
                  ? pubs.filter(p => selected.has(p.id) && p.resolve_status === "pending").length
                  : counts.pending
                return (
                  <Button
                    onClick={resolveAll}
                    disabled={running || loading || pendingCount === 0}
                    variant="outline"
                    size="sm"
                  >
                    {running ? "..." : `Solo resolver (${pendingCount})`}
                  </Button>
                )
              })()}

              {/* Solo optin (sobre ya resueltos) */}
              {(() => {
                const resolvedCount = selected.size > 0 ? selectedResolved : counts.resolved
                return (
                  <Button
                    onClick={runOptin}
                    disabled={running || resolvedCount === 0 || (!dryRun && !confirmLive)}
                    variant="outline"
                    size="sm"
                  >
                    {dryRun ? `Solo optin DRY (${resolvedCount})` : `Solo optin LIVE (${resolvedCount})`}
                  </Button>
                )
              })()}

              {running && (
                <Button onClick={() => { abortRef.current = true; setRunning(false) }} variant="destructive" size="sm">
                  Detener
                </Button>
              )}
            </div>
          )}

          {/* Filter tabs */}
          {pubs.length > 0 && (
            <div className="flex gap-2 flex-wrap text-sm">
              {(["all", "resolved", "not_found", "ambiguous", "no_ean"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full border text-xs transition-colors ${
                    filter === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f === "all"       ? `Todos (${counts.total})`
                   : f === "resolved"  ? `Resueltos (${counts.resolved})`
                   : f === "not_found" ? `Sin match (${counts.not_found})`
                   : f === "ambiguous" ? `Ambiguos (${counts.ambiguous})`
                   : `Sin EAN (${counts.no_ean})`}
                </button>
              ))}
            </div>
          )}

          {/* Table */}
          {filteredPubs.length > 0 && (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected }}
                        onChange={toggleAllVisible}
                        className="rounded border-input"
                        aria-label="Seleccionar todos visibles"
                      />
                    </th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Item ID</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Titulo</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">EAN</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Resolucion</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Catalogo ID</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Optin</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPubs.slice(0, 500).map(p => (
                    <tr
                      key={p.id}
                      onClick={() => toggleOne(p.id)}
                      className={`border-b border-border/50 cursor-pointer transition-colors ${
                        selected.has(p.id) ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/20"
                      }`}
                    >
                      <td className="px-3 py-1.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleOne(p.id)}
                          className="rounded border-input"
                        />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-zinc-400">{p.ml_item_id}</td>
                      <td className="px-3 py-1.5 text-foreground max-w-[240px] truncate">{p.title}</td>
                      <td className="px-3 py-1.5 font-mono text-zinc-500">{getEan(p) ?? <span className="text-zinc-700">—</span>}</td>
                      <td className="px-3 py-1.5">
                        <ResolveStatusBadge status={p.resolve_status ?? "pending"} />
                      </td>
                      <td className="px-3 py-1.5" onClick={e => e.stopPropagation()}>
                        {p.resolve_status === "ambiguous" ? (
                          <AmbiguousSelect
                            options={p.ambiguous_options ?? []}
                            onSelect={id => setPubs(prev => prev.map(x =>
                              x.id === p.id ? { ...x, catalog_product_id: id, resolve_status: "resolved" } : x
                            ))}
                          />
                        ) : p.catalog_product_id ? (
                          <span className="font-mono text-blue-400">{p.catalog_product_id}</span>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {p.optin_status === "ok"      && <Badge variant="outline" className="text-green-400 text-xs border-green-400/30">OK</Badge>}
                        {p.optin_status === "dry"     && <Badge variant="outline" className="text-yellow-400 text-xs border-yellow-400/30">DRY</Badge>}
                        {p.optin_status === "failed"  && <span title={p.optin_error ?? ""} className="text-red-400 cursor-help">FAIL</span>}
                        {p.optin_status === "running" && <span className="text-blue-400 animate-pulse">...</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPubs.length > 500 && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                  Mostrando 500 de {filteredPubs.length} — usa el filtro para ver segmentos especificos
                </div>
              )}
            </div>
          )}

          {!loading && pubs.length === 0 && accountId && (
            <div className="text-sm text-muted-foreground text-center py-8">
              No hay publicaciones activas o pausadas con EAN, ISBN o GTIN para esta cuenta.
            </div>
          )}
        </>
      )}

      {/* Log */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Logs</span>
          <button onClick={() => setLogs([])} className="text-xs text-muted-foreground hover:text-foreground">Limpiar</button>
        </div>
        <div className="h-48 overflow-y-auto rounded-lg border border-border bg-black/60 p-3 font-mono text-xs">
          {logs.length === 0
            ? <span className="text-zinc-600">Sin actividad.</span>
            : logs.map((l, i) => (
              <div key={i} className={
                l.type === "error" ? "text-red-400"
                : l.type === "ok"  ? "text-green-400"
                : l.type === "warn"? "text-yellow-400"
                : "text-zinc-300"
              }>{l.ts} - {l.msg}</div>
            ))
          }
          <div ref={logEndRef} />
        </div>
      </div>

    </main>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ResolveStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: "Pendiente", cls: "text-zinc-500 border-zinc-500/30" },
    resolving: { label: "Buscando",  cls: "text-blue-400 border-blue-400/30 animate-pulse" },
    resolved:  { label: "Resuelto",  cls: "text-blue-400 border-blue-400/30" },
    not_found: { label: "Sin match", cls: "text-orange-400 border-orange-400/30" },
    ambiguous: { label: "Ambiguo",   cls: "text-yellow-400 border-yellow-400/30" },
    no_ean:    { label: "Sin EAN",   cls: "text-zinc-600 border-zinc-600/30" },
  }
  const { label, cls } = map[status] ?? { label: status, cls: "text-zinc-500" }
  return <Badge variant="outline" className={`text-xs ${cls}`}>{label}</Badge>
}

function AmbiguousSelect({ options, onSelect }: { options: { id: string; name: string }[]; onSelect: (id: string) => void }) {
  return (
    <select
      onChange={e => { if (e.target.value) onSelect(e.target.value) }}
      defaultValue=""
      onClick={e => e.stopPropagation()}
      className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground max-w-[200px]"
    >
      <option value="">Elegir...</option>
      {options.map(o => (
        <option key={o.id} value={o.id}>{o.id} — {o.name.slice(0, 40)}</option>
      ))}
    </select>
  )
}
