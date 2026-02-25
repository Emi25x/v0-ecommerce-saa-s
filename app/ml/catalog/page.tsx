"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Search, Play, AlertTriangle, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Loader2, RefreshCw, ShieldCheck
} from "lucide-react"

type AuditItem = {
  ml_item_id: string
  title: string
  price: number
  ean: string | null
  already_catalog: boolean
  catalog_product_id: string | null
  permalink: string | null
  // after resolve:
  action?: string
  matched_catalog_id?: string
  catalog_name?: string
  matches?: number
  resolve_error?: string
}

type JobStatus = {
  id: string
  status: string
  mode: string
  total_target: number
  processed: number
  success: number
  failed: number
  created_at: string
  started_at: string | null
  finished_at: string | null
  last_error: string | null
}

type JobItem = {
  id: string
  old_item_id: string
  new_item_id: string | null
  ean: string | null
  action: string
  status: string
  error: string | null
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create_new_catalog_item: { label: "Migrar", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  skip_no_match:           { label: "Sin match", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
  skip_ambiguous:          { label: "Ambiguo", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  skip_already_catalog:    { label: "Ya catálogo", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  skip_no_ean:             { label: "Sin EAN", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
}

const STATUS_COLORS: Record<string, string> = {
  ok:      "bg-green-500/20 text-green-400",
  failed:  "bg-red-500/20 text-red-400",
  skipped: "bg-zinc-500/20 text-zinc-400",
  pending: "bg-yellow-500/20 text-yellow-400",
}

export default function MLCatalogPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [accountId, setAccountId] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [log, setLog] = useState<string[]>([])

  // Audit state
  const [auditData, setAuditData] = useState<any>(null)
  const [resolvedItems, setResolvedItems] = useState<AuditItem[]>([])
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Job state
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null)
  const [jobItems, setJobItems] = useState<JobItem[]>([])
  const [jobRunning, setJobRunning] = useState(false)
  const [jobHistory, setJobHistory] = useState<JobStatus[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const abortRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString("es-AR", { hour12: false })
    setLog((prev) => [...prev.slice(-200), `${time} - ${msg}`])
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
  }

  // Cargar cuentas
  useEffect(() => {
    fetch("/api/ml/accounts")
      .then((r) => r.json())
      .then((d) => {
        const accs = d.accounts || []
        setAccounts(accs)
        if (accs.length > 0) setAccountId(accs[0].id)
      })
  }, [])

  // Cargar historial cuando cambia cuenta
  useEffect(() => {
    if (!accountId) return
    fetch(`/api/ml/catalog/job/status?account_id=${accountId}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setJobHistory(d.jobs || []) })
  }, [accountId])

  // PASO 1: Auditar
  async function handleAudit() {
    if (!accountId) return
    setLoading(true)
    setAuditData(null)
    setResolvedItems([])
    setActiveJob(null)
    addLog("Auditando publicaciones activas...")
    try {
      const res = await fetch(`/api/ml/catalog/audit?account_id=${accountId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAuditData(data)
      addLog(`Auditoria completa: ${data.total} publicaciones, ${data.already_catalog} ya catalogo, ${data.candidate_count} candidatas, ${data.no_ean} sin EAN`)
    } catch (e: any) {
      addLog(`Error en auditoria: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  // PASO 2: Resolver
  async function handleResolve() {
    if (!auditData?.candidates?.length) return
    setLoading(true)
    addLog(`Resolviendo catalog_product_id para ${auditData.candidates.length} candidatas...`)
    try {
      const res = await fetch("/api/ml/catalog/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, items: auditData.candidates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const migrables = data.resolved.filter((r: any) => r.action === "create_new_catalog_item").length
      const noMatch = data.resolved.filter((r: any) => r.action === "skip_no_match").length
      const ambiguous = data.resolved.filter((r: any) => r.action === "skip_ambiguous").length
      addLog(`Resolve completo: ${migrables} migrables, ${noMatch} sin match, ${ambiguous} ambiguos`)
      setResolvedItems(data.resolved)
    } catch (e: any) {
      addLog(`Error en resolve: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  // PASO 3: Crear job
  async function handleCreateJob(mode: "dry_run" | "live") {
    if (!resolvedItems.length) return
    setLoading(true)
    addLog(`Creando job (${mode === "dry_run" ? "Dry Run" : "LIVE"}) con ${resolvedItems.length} items...`)
    try {
      const res = await fetch("/api/ml/catalog/job/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, mode, resolved_items: resolvedItems }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      addLog(`Job creado: ${data.job_id} — listo para ejecutar`)
      // Cargar el job creado
      const statusRes = await fetch(`/api/ml/catalog/job/status?job_id=${data.job_id}`)
      const statusData = await statusRes.json()
      if (statusData.ok) { setActiveJob(statusData.job); setJobItems(statusData.items || []) }
    } catch (e: any) {
      addLog(`Error creando job: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  // PASO 4: Ejecutar job en loop
  async function handleRunJob() {
    if (!activeJob) return
    setJobRunning(true)
    abortRef.current = false
    addLog(`Ejecutando job ${activeJob.id} (${activeJob.mode})...`)

    let done = false
    while (!done && !abortRef.current) {
      try {
        const res = await fetch("/api/ml/catalog/job/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: activeJob.id, batch_size: 10 }),
        })
        const data = await res.json()
        if (!res.ok) { addLog(`Error en batch: ${data.error}`); break }

        done = data.done
        addLog(`Batch: ${data.batch_ok} ok, ${data.batch_failed} fallidos. Restantes: ${data.remaining}`)

        // Refrescar estado del job
        const statusRes = await fetch(`/api/ml/catalog/job/status?job_id=${activeJob.id}`)
        const statusData = await statusRes.json()
        if (statusData.ok) { setActiveJob(statusData.job); setJobItems(statusData.items || []) }

        if (!done) await new Promise((r) => setTimeout(r, 500))
      } catch (e: any) {
        addLog(`Error: ${e.message}`)
        break
      }
    }

    addLog(done ? "Job completado." : "Job pausado.")
    setJobRunning(false)
    // Refrescar historial
    const histRes = await fetch(`/api/ml/catalog/job/status?account_id=${accountId}`)
    const histData = await histRes.json()
    if (histData.ok) setJobHistory(histData.jobs || [])
  }

  const migrableCount = resolvedItems.filter((r) => r.action === "create_new_catalog_item").length
  const jobPct = activeJob?.total_target
    ? Math.round(((activeJob.processed) / activeJob.total_target) * 100)
    : 0

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Migración a Catálogo ML</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Detecta publicaciones tradicionales y migra a catálogo en lote. No toca importadores ni matchers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-400" />
            <span className="text-xs text-muted-foreground">Solo lectura hasta que confirmes</span>
          </div>
        </div>

        {/* Selector de cuenta */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground">Cuenta ML:</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.nickname || a.ml_user_id || a.id}</option>
            ))}
          </select>
        </div>

        {/* PASO 1: Auditar */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Paso 1 — Auditar publicaciones</h2>
              <p className="text-xs text-muted-foreground">Analiza publicaciones activas: cuáles ya son catálogo, cuáles tienen EAN, cuáles pueden migrar.</p>
            </div>
            <Button onClick={handleAudit} disabled={loading || !accountId} size="sm">
              {loading && !auditData ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Auditar
            </Button>
          </div>

          {auditData && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Total", value: auditData.total, color: "text-foreground" },
                { label: "Ya catálogo", value: auditData.already_catalog, color: "text-green-400" },
                { label: "Sin EAN", value: auditData.no_ean, color: "text-zinc-400" },
                { label: "Candidatas", value: auditData.candidate_count, color: "text-blue-400" },
              ].map((s) => (
                <div key={s.label} className="bg-secondary rounded-md p-3 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PASO 2: Resolver */}
        {auditData?.candidate_count > 0 && (
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Paso 2 — Resolver catalog_product_id</h2>
                <p className="text-xs text-muted-foreground">Busca en catálogo ML por EAN. Solo acepta match exacto único.</p>
              </div>
              <Button onClick={handleResolve} disabled={loading || !auditData} size="sm" variant="outline">
                {loading && resolvedItems.length === 0 ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Resolver ({auditData.candidate_count})
              </Button>
            </div>

            {resolvedItems.length > 0 && (
              <>
                {/* Summary badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(
                    resolvedItems.reduce((acc: any, r) => {
                      acc[r.action || "skip_no_ean"] = (acc[r.action || "skip_no_ean"] || 0) + 1
                      return acc
                    }, {})
                  ).map(([action, count]: any) => (
                    <span key={action} className={`text-xs border px-2 py-0.5 rounded-full ${ACTION_LABELS[action]?.color || ""}`}>
                      {ACTION_LABELS[action]?.label || action}: {count}
                    </span>
                  ))}
                </div>

                {/* Tabla de items resueltos */}
                <div className="overflow-auto max-h-72 rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Item</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">EAN</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Acción</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Catalog ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolvedItems.map((item) => (
                        <tr key={item.ml_item_id} className="border-t border-border hover:bg-secondary/50">
                          <td className="px-3 py-2 font-mono text-muted-foreground">{item.ml_item_id}</td>
                          <td className="px-3 py-2">{item.ean || <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-2">
                            <span className={`border rounded-full px-2 py-0.5 text-xs ${ACTION_LABELS[item.action || ""]?.color || ""}`}>
                              {ACTION_LABELS[item.action || ""]?.label || item.action}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-blue-400">
                            {item.catalog_product_id || item.matched_catalog_id || <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* PASO 3: Crear job */}
        {resolvedItems.length > 0 && (
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div>
              <h2 className="font-semibold">Paso 3 — Crear job de migración</h2>
              <p className="text-xs text-muted-foreground">
                <strong className="text-blue-400">{migrableCount}</strong> publicaciones listas para migrar.
                Dry Run no toca ML — solo simula. Live crea items de catálogo y pausa los originales.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => handleCreateJob("dry_run")}
                disabled={loading || migrableCount === 0}
                variant="outline"
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                Crear job (Dry Run)
              </Button>
              <Button
                onClick={() => handleCreateJob("live")}
                disabled={loading || migrableCount === 0}
                variant="destructive"
                size="sm"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Crear job (LIVE)
              </Button>
            </div>
          </div>
        )}

        {/* PASO 4: Ejecutar job activo */}
        {activeJob && (
          <div className="border border-blue-500/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Paso 4 — Ejecutar job</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs border rounded-full px-2 py-0.5 ${activeJob.mode === "live" ? "border-red-500/30 text-red-400" : "border-blue-500/30 text-blue-400"}`}>
                    {activeJob.mode === "live" ? "LIVE" : "Dry Run"}
                  </span>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_COLORS[activeJob.status] || ""}`}>
                    {activeJob.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {activeJob.processed}/{activeJob.total_target} — {activeJob.success} ok, {activeJob.failed} fallidos
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                {activeJob.status !== "completed" && (
                  <Button
                    onClick={handleRunJob}
                    disabled={jobRunning}
                    size="sm"
                    variant={activeJob.mode === "live" ? "destructive" : "default"}
                  >
                    {jobRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                    {jobRunning ? "Ejecutando..." : "Ejecutar"}
                  </Button>
                )}
                {jobRunning && (
                  <Button onClick={() => { abortRef.current = true }} variant="outline" size="sm">
                    Pausar
                  </Button>
                )}
              </div>
            </div>

            <Progress value={jobPct} className="h-2" />

            {/* Tabla de items del job */}
            {jobItems.length > 0 && (
              <div className="overflow-auto max-h-64 rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-secondary sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Item viejo</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Item nuevo</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Acción</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Estado</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobItems.map((item) => (
                      <tr key={item.id} className="border-t border-border hover:bg-secondary/50">
                        <td className="px-3 py-2 font-mono text-muted-foreground">{item.old_item_id}</td>
                        <td className="px-3 py-2 font-mono text-green-400">{item.new_item_id || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`border rounded-full px-2 py-0.5 ${ACTION_LABELS[item.action]?.color || ""}`}>
                            {ACTION_LABELS[item.action]?.label || item.action}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 ${STATUS_COLORS[item.status] || ""}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-red-400 max-w-xs truncate">{item.error || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Log */}
        <div className="border border-border rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Log</h3>
          <div className="bg-black/40 rounded p-3 font-mono text-xs text-green-400 h-36 overflow-y-auto">
            {log.length === 0 && <span className="text-muted-foreground">Esperando acciones...</span>}
            {log.map((l, i) => <div key={i}>{l}</div>)}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Historial de jobs */}
        {jobHistory.length > 0 && (
          <div className="border border-border rounded-lg p-4 space-y-2">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold w-full text-left"
            >
              Historial de jobs ({jobHistory.length})
              {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showHistory && (
              <div className="overflow-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">ID</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Modo</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Estado</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Progreso</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fecha</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobHistory.map((j) => (
                      <tr key={j.id} className="border-t border-border hover:bg-secondary/50">
                        <td className="px-3 py-2 font-mono text-muted-foreground">{j.id.slice(0, 8)}...</td>
                        <td className="px-3 py-2">
                          <span className={`border rounded-full px-2 py-0.5 ${j.mode === "live" ? "border-red-500/30 text-red-400" : "border-blue-500/30 text-blue-400"}`}>
                            {j.mode === "live" ? "LIVE" : "Dry Run"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 ${STATUS_COLORS[j.status] || ""}`}>{j.status}</span>
                        </td>
                        <td className="px-3 py-2">{j.success}/{j.total_target} ok · {j.failed} err</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(j.created_at).toLocaleDateString("es-AR")}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={async () => {
                              const r = await fetch(`/api/ml/catalog/job/status?job_id=${j.id}`)
                              const d = await r.json()
                              if (d.ok) { setActiveJob(d.job); setJobItems(d.items || []) }
                            }}
                            className="text-blue-400 hover:underline"
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
