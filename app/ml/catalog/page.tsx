"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

// ── Types ──────────────────────────────────────────────────────────────────

type Job = {
  id: string
  account_id: string
  status: "idle" | "running" | "completed" | "failed" | "canceled"
  phase: "audit" | "resolve_catalog_product" | "migrate"
  total_estimated: number
  processed_count: number
  already_catalog_count: number
  no_ean_count: number
  candidates_count: number
  resolved_count: number
  migrated_count: number
  last_error: string | null
  dry_run: boolean
  created_at: string
}

type Counts = {
  candidates: number
  migrables: number   // resueltos con match único, listos para optin
  no_match: number    // not_found + ambiguous — nunca entran al job
  optin_ok: number
  optin_failed: number
  errors: number
}

type FailedItem = {
  item_id: string
  ean: string | null
  migrate_status: string
  error: string | null
}

const MAX_LOG_LINES = 200

const STATUS_COLOR: Record<string, string> = {
  idle:      "text-zinc-400",
  running:   "text-blue-400",
  completed: "text-green-400",
  failed:    "text-red-400",
  canceled:  "text-orange-400",
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MLCatalogMigrationPage() {
  const [accounts, setAccounts]       = useState<any[]>([])
  const [accountId, setAccountId]     = useState<string>("")
  const [job, setJob]                 = useState<Job | null>(null)
  const [counts, setCounts]           = useState<Counts>({ candidates: 0, migrables: 0, no_match: 0, optin_ok: 0, optin_failed: 0, errors: 0 })
  const [logs, setLogs]               = useState<string[]>([])
  const [running, setRunning]         = useState(false)
  const [confirmLive, setConfirmLive] = useState(false)
  const [batchSize, setBatchSize]     = useState(200)

  // Error modal
  const [errorModal, setErrorModal]   = useState<FailedItem[] | null>(null)

  const abortRef  = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // ── Helpers ──────────────────────────────────────────────────────────────

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    setLogs((prev) => {
      const next = [...prev, `${ts} - ${msg}`]
      return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next
    })
  }, [])

  const post = useCallback(async (url: string, body: any) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    return res.json().catch(() => ({}))
  }, [])

  const refreshStatus = useCallback(async (accId: string) => {
    if (!accId) return
    const res = await fetch(`/api/ml/catalog-migration/status?accountId=${accId}`)
    const data = await res.json().catch(() => ({}))
    if (data.job)    setJob(data.job)
    if (data.counts) setCounts(data.counts)
  }, [])

  const loadErrorItems = useCallback(async (jobId: string) => {
    const res = await fetch(`/api/ml/catalog-migration/errors?jobId=${jobId}`)
    const data = await res.json().catch(() => ({}))
    setErrorModal(data.items ?? [])
  }, [])

  // ── Load accounts ────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/ml/accounts")
      .then((r) => r.json())
      .then((d) => {
        const accs = d.accounts || []
        setAccounts(accs)
        const saved = typeof window !== "undefined" ? localStorage.getItem("ml_selected_account") : null
        const match = saved && accs.find((a: any) => a.id === saved)
        const selected = match ? match.id : accs[0]?.id || ""
        setAccountId(selected)
        if (selected) refreshStatus(selected)
      })
  }, [refreshStatus])

  useEffect(() => {
    if (accountId) refreshStatus(accountId)
  }, [accountId, refreshStatus])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  // ── Loop runner ──────────────────────────────────────────────────────────

  const runLoop = useCallback(async (runUrl: string, body: any, label: string) => {
    setRunning(true)
    abortRef.current = false
    let iteration = 0
    try {
      while (!abortRef.current) {
        iteration++
        const data = await post(runUrl, { ...body, batchSize })
        if (data.error) { addLog(`Error en ${label}: ${data.error}`); break }

        const parts: string[] = []
        if (data.batch_processed  !== undefined) parts.push(`lote=${data.batch_processed}`)
        if (data.resolved         !== undefined) parts.push(`resueltos=${data.resolved}`)
        if (data.optin_ok         !== undefined) parts.push(`optin_ok=${data.optin_ok}`)
        if (data.skipped          !== undefined && data.skipped > 0)  parts.push(`saltados=${data.skipped}`)
        if (data.errors           !== undefined && data.errors > 0)   parts.push(`errores=${data.errors}`)
        if (data.cumulative_processed !== undefined) parts.push(`total=${data.cumulative_processed}/${data.total_estimated || "?"}`)
        if (data.remaining        !== undefined) parts.push(`restantes=${data.remaining}`)

        addLog(`${label} #${iteration}: ${parts.join(" | ")}`)

        if (iteration % 3 === 0) await refreshStatus(accountId)

        if (data.done || !data.has_more) {
          addLog(`${label} completado (${iteration} lotes)`)
          break
        }
        await new Promise((r) => setTimeout(r, 500))
      }
    } finally {
      setRunning(false)
      await refreshStatus(accountId)
    }
  }, [post, batchSize, addLog, refreshStatus, accountId])

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleAudit = useCallback(async () => {
    if (!accountId) return
    addLog("Iniciando auditoria...")
    const startData = await post("/api/ml/catalog-migration/audit/start", { accountId })
    if (startData.error) { addLog(`Error: ${startData.error}`); return }
    setJob(startData.job || null)
    addLog(`Job ${startData.jobId} ${startData.resumed ? "retomado" : "creado"}`)
    await runLoop("/api/ml/catalog-migration/audit/run", { jobId: startData.jobId }, "Auditoria")
  }, [accountId, post, addLog, runLoop])

  const handleResolve = useCallback(async () => {
    if (!job) return
    addLog("Iniciando resolucion de catalog_product_id...")
    const startData = await post("/api/ml/catalog-migration/resolve/start", { jobId: job.id })
    if (startData.error) { addLog(`Error: ${startData.error}`); return }
    if (startData.pending === 0) { addLog(startData.message || "Sin candidatos pendientes"); return }
    addLog(`${startData.pending} candidatos a resolver`)
    await runLoop("/api/ml/catalog-migration/resolve/run", { jobId: job.id }, "Resolucion")
  }, [job, post, addLog, runLoop])

  const handleMigrate = useCallback(async (dryRun: boolean) => {
    if (!job) return
    if (!dryRun && !confirmLive) {
      addLog("Confirma la migracion LIVE antes de ejecutar")
      return
    }
    addLog(`Iniciando OPTIN ${dryRun ? "(DRY RUN)" : "(LIVE)"}...`)
    const startData = await post("/api/ml/catalog-migration/migrate/start", { jobId: job.id, dryRun })
    if (startData.error) { addLog(`Error: ${startData.error}`); return }
    if (startData.pending === 0) { addLog(startData.message || "Sin items listos para optin"); return }
    addLog(`${startData.pending} items listos para optin`)
    await runLoop("/api/ml/catalog-migration/migrate/run", { jobId: job.id }, dryRun ? "Simulacion" : "Optin LIVE")
  }, [job, confirmLive, post, addLog, runLoop])

  const handleCancel = useCallback(async () => {
    abortRef.current = true
    if (job) {
      await post("/api/ml/catalog-migration/status", { jobId: job.id, action: "cancel" })
      addLog("Job cancelado")
      await refreshStatus(accountId)
    }
    setRunning(false)
  }, [job, post, addLog, refreshStatus, accountId])

  // ── Progress ──────────────────────────────────────────────────────────────

  const progressPct = job && job.total_estimated > 0
    ? Math.min(100, Math.round((job.processed_count / job.total_estimated) * 100))
    : 0

  const phaseLabel =
    job?.phase === "audit" ? "Auditoria"
    : job?.phase === "resolve_catalog_product" ? "Resolucion"
    : job?.phase === "migrate" ? "Optin"
    : "-"

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="flex flex-col gap-6 p-6 max-w-5xl mx-auto font-sans">

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">Migrar a Catalogo ML</h1>
        <p className="text-sm text-muted-foreground">
          Aplica OPTIN a publicaciones tradicionales existentes. No crea publicaciones nuevas. Soporta 50 000+ items con resume automatico.
        </p>
      </div>

      {/* Account + batch selectors */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted-foreground whitespace-nowrap">Cuenta ML</label>
        <select
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value)
            if (typeof window !== "undefined") localStorage.setItem("ml_selected_account", e.target.value)
          }}
          disabled={running}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname}</option>)}
        </select>
        <label className="text-sm text-muted-foreground ml-4 whitespace-nowrap">Batch size</label>
        <select
          value={batchSize}
          onChange={(e) => setBatchSize(Number(e.target.value))}
          disabled={running}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          {[50, 100, 200].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* Job status card */}
      {job && (
        <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">Job activo</span>
              <Badge variant="outline" className={`text-xs ${STATUS_COLOR[job.status] || ""}`}>
                {job.status}
              </Badge>
              <span className="text-xs text-muted-foreground">Fase: {phaseLabel}</span>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{job.id.slice(0, 8)}...</span>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Auditadas: {job.processed_count.toLocaleString()}</span>
              <span>{job.total_estimated > 0 ? `de ${job.total_estimated.toLocaleString()} estimadas` : "total desconocido"}</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>

          {/* Counters grid — Paso 2 muestra Migrables y Sin match claramente */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Ya catalogo",  val: job.already_catalog_count,  color: "text-green-400",  tip: "Ya eran catalogo antes de empezar" },
              { label: "Sin EAN",      val: job.no_ean_count,           color: "text-zinc-500",   tip: "No tienen EAN — no se pueden resolver" },
              { label: "Migrables",    val: counts.migrables,           color: "text-blue-400",   tip: "Resueltos con match unico — listos para optin" },
              { label: "Sin match",    val: counts.no_match,            color: "text-orange-400", tip: "not_found o ambiguos — no entran al job" },
            ].map(({ label, val, color, tip }) => (
              <div key={label} title={tip} className="flex flex-col items-center rounded-md border border-border bg-background p-3 cursor-help">
                <span className={`text-2xl font-semibold tabular-nums ${color}`}>{val.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground text-center leading-tight mt-1">{label}</span>
              </div>
            ))}
          </div>

          {/* Optin results row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Optin OK",     val: counts.optin_ok,     color: "text-green-400" },
              { label: "Optin fallido",val: counts.optin_failed,  color: "text-red-400" },
              { label: "Errores",      val: counts.errors,        color: "text-red-400" },
            ].map(({ label, val, color }) => (
              <div key={label} className="flex flex-col items-center rounded-md border border-border bg-background p-2">
                <span className={`text-lg font-semibold tabular-nums ${color}`}>{val.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground text-center leading-tight mt-0.5">{label}</span>
              </div>
            ))}
          </div>

          {job.last_error && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded px-3 py-2 font-mono">
              Ultimo error: {job.last_error}
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 items-start">

        <Button onClick={handleAudit} disabled={running || !accountId} variant="outline" size="sm">
          {running ? "Procesando..." : job ? "Re-auditar" : "Auditar publicaciones"}
        </Button>

        <Button
          onClick={handleResolve}
          disabled={running || !job || (job.candidates_count === 0)}
          variant="outline"
          size="sm"
        >
          Resolver catalogo ({job?.candidates_count ?? 0} candidatos)
        </Button>

        {/* Migrate: DRY y LIVE separados */}
        <div className="flex flex-col gap-2 border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground font-medium">
            Optin al catalogo — {counts.migrables} migrables / {counts.no_match} sin match (sin match no entran)
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => handleMigrate(true)}
              disabled={running || !job || counts.migrables === 0}
              variant="outline"
              size="sm"
            >
              Simular DRY ({counts.migrables})
            </Button>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmLive}
                  onChange={(e) => setConfirmLive(e.target.checked)}
                  disabled={running}
                  className="rounded border-input"
                />
                Confirmo LIVE
              </label>
              <Button
                onClick={() => handleMigrate(false)}
                disabled={running || !job || counts.migrables === 0 || !confirmLive}
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                Optin LIVE ({counts.migrables})
              </Button>
            </div>
          </div>
        </div>

        {running && (
          <Button onClick={handleCancel} variant="destructive" size="sm">Cancelar</Button>
        )}

        {!running && (
          <Button onClick={() => refreshStatus(accountId)} variant="ghost" size="sm" className="text-muted-foreground">
            Actualizar estado
          </Button>
        )}

        {/* Ver errores */}
        {!running && job && (counts.optin_failed + counts.errors) > 0 && (
          <Button
            onClick={() => loadErrorItems(job.id)}
            variant="outline"
            size="sm"
            className="text-red-400 border-red-400/30 hover:bg-red-500/10"
          >
            Ver errores ({counts.optin_failed + counts.errors})
          </Button>
        )}
      </div>

      {/* Log console */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Logs</span>
          <button onClick={() => setLogs([])} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Limpiar
          </button>
        </div>
        <div className="h-64 overflow-y-auto rounded-lg border border-border bg-black/60 p-3 font-mono text-xs">
          {logs.length === 0 ? (
            <span className="text-zinc-600">Sin logs — inicia una operacion para ver el progreso.</span>
          ) : (
            logs.map((line, i) => (
              <div key={i} className={
                line.includes("Error") || line.includes("error") || line.includes("fallido")
                  ? "text-red-400"
                  : line.includes("completado") || line.includes("optin_ok") || line.includes("OK")
                  ? "text-green-400"
                  : line.includes("DRY") || line.includes("Simul")
                  ? "text-yellow-400"
                  : "text-zinc-300"
              }>{line}</div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Error modal */}
      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setErrorModal(null)}>
          <div
            className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Items con error ({errorModal.length})</h2>
              <button onClick={() => setErrorModal(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
            </div>
            {errorModal.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin errores.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4">Item ID</th>
                    <th className="pb-2 pr-4">EAN</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {errorModal.map((item, i) => (
                    <tr key={i} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-4 font-mono text-blue-400">{item.item_id}</td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">{item.ean ?? "-"}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-red-400 border-red-400/30 text-xs">{item.migrate_status}</Badge>
                      </td>
                      <td className="py-2 text-red-300 break-all max-w-xs">{item.error || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
