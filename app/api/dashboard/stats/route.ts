/**
 * GET /api/dashboard/stats
 *
 * Consolidated dashboard metrics in a single call.
 * Uses admin client for cross-table queries.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { createAdminClient } from "@/lib/db/admin"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  // All queries in parallel
  const [
    salesTotal,
    salesPending,
    salesBlocked,
    salesFailed,
    salesSentToday,
    productsWithStock,
    productsTotal,
    sourcesActive,
    sourcesLastRuns,
    mlAccountsResult,
    shopifyStoresResult,
    exportsToday,
    processRuns,
    mlPubsTotal,
    mlPubsNoSku,
  ] = await Promise.all([
    // Sales last 24h
    admin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("order_date", new Date(Date.now() - 86400000).toISOString()),
    admin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("libral_status", "pending_export"),
    admin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("libral_status", "export_blocked"),
    admin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("libral_status", "failed"),
    admin
      .from("libral_order_exports")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    // Stock
    admin
      .from("products")
      .select("*", { count: "exact", head: true })
      .gt("stock", 0),
    admin
      .from("products")
      .select("*", { count: "exact", head: true }),
    // Sources
    admin
      .from("import_sources")
      .select("id, name, source_key, feed_type, is_active, warehouse_id")
      .eq("is_active", true),
    admin
      .from("import_schedules")
      .select("id, source_id, enabled, frequency, hour, minute, last_run_at, next_run_at, import_sources(name)")
      .eq("enabled", true),
    // Accounts — use the ML accounts endpoint logic (includes token refresh)
    supabase
      .from("ml_accounts")
      .select("id, nickname, token_expires_at, access_token, refresh_token, platform_code, empresa_id")
      .order("created_at", { ascending: false }),
    admin
      .from("shopify_stores")
      .select("id, name, shop_domain, is_active, platform_code, empresa_id")
      .eq("is_active", true),
    // Exports today
    admin
      .from("libral_order_exports")
      .select("id, status, action, reference, last_error, created_at")
      .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .order("created_at", { ascending: false })
      .limit(20),
    // Process runs (last 10)
    admin
      .from("process_runs")
      .select("id, process_type, process_name, status, started_at, duration_ms, rows_processed, rows_updated, rows_failed, error_message")
      .order("started_at", { ascending: false })
      .limit(10),
    // ML publications
    admin
      .from("ml_publications")
      .select("*", { count: "exact", head: true }),
    admin
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .or("sku.is.null,ean.is.null"),
  ])

  // Process ML accounts — refresh tokens if needed (same as /api/ml/accounts)
  let refreshTokenIfNeeded: any = null
  try {
    const ml = await import("@/lib/mercadolibre")
    refreshTokenIfNeeded = ml.refreshTokenIfNeeded
  } catch { /* module might not exist */ }

  const mlAccounts = await Promise.all(
    (mlAccountsResult.data ?? []).map(async (a: any) => {
      let tokenExpired = true
      try {
        if (refreshTokenIfNeeded && a.access_token && a.refresh_token) {
          const refreshed = await refreshTokenIfNeeded({
            id: a.id,
            access_token: a.access_token,
            refresh_token: a.refresh_token,
            token_expires_at: a.token_expires_at,
          })
          tokenExpired = new Date(refreshed.token_expires_at) <= new Date()
        } else {
          tokenExpired = !a.token_expires_at || new Date(a.token_expires_at) <= new Date()
        }
      } catch {
        tokenExpired = !a.token_expires_at || new Date(a.token_expires_at) <= new Date()
      }
      return {
        id: a.id,
        nickname: a.nickname,
        tokenExpired,
        platform_code: a.platform_code ?? null,
        empresa_id: a.empresa_id ?? null,
      }
    }),
  )

  const shopifyStores = (shopifyStoresResult.data ?? []).map((s: any) => ({
    id: s.id,
    name: s.name ?? s.shop_domain,
    platform_code: s.platform_code ?? null,
    empresa_id: s.empresa_id ?? null,
  }))

  // Build schedules with diagnostic — fetch ALL schedules (not just enabled)
  // and last process_run per source for root cause analysis
  const { data: allSchedules } = await admin
    .from("import_schedules")
    .select("id, source_id, enabled, frequency, hour, minute, timezone, last_run_at, next_run_at, import_sources(id, name, source_key, feed_type, is_active)")

  // Fetch recent process_runs for each source (last 3 per source for diagnosis)
  const sourceIds = (sourcesActive.data ?? []).map((s: any) => s.id)
  const { data: recentRuns } = sourceIds.length > 0
    ? await admin
        .from("process_runs")
        .select("id, process_type, process_name, status, started_at, duration_ms, rows_processed, rows_updated, rows_failed, error_message")
        .order("started_at", { ascending: false })
        .limit(50)
    : { data: [] }

  const now = new Date()

  // Build diagnosis per active source
  const sourceDiagnostics = (sourcesActive.data ?? []).map((source: any) => {
    const schedule = (allSchedules ?? []).find((s: any) => s.source_id === source.id)
    const sourceRuns = (recentRuns ?? []).filter((r: any) =>
      r.process_name?.toLowerCase().includes(source.name?.toLowerCase()?.split(" ")[0]) ||
      r.process_type?.toLowerCase().includes(source.source_key?.toLowerCase())
    ).slice(0, 3)

    const lastRun = sourceRuns[0] ?? null
    const lastRunAt = schedule?.last_run_at ? new Date(schedule.last_run_at) : null
    const hoursSinceRun = lastRunAt ? (now.getTime() - lastRunAt.getTime()) / 3600000 : null

    // Determine status
    let status: "ok" | "delayed" | "error" | "never_run" | "disabled" = "ok"
    if (!schedule) status = "disabled"
    else if (!schedule.enabled) status = "disabled"
    else if (!lastRunAt) status = "never_run"
    else if (hoursSinceRun! > 48) status = "error"
    else if (hoursSinceRun! > 25) status = "delayed"

    // Root cause diagnosis
    let diagnosis: string | null = null
    let suggestion: string | null = null

    if (status === "disabled") {
      if (!schedule) {
        diagnosis = "Sin schedule configurado"
        suggestion = "Crear schedule desde Fuentes → icono reloj"
      } else {
        diagnosis = "Schedule deshabilitado"
        suggestion = "Habilitar desde Fuentes → icono reloj"
      }
    } else if (status === "never_run") {
      if (schedule?.next_run_at && new Date(schedule.next_run_at) > now) {
        diagnosis = `Programado para ${new Date(schedule.next_run_at).toLocaleString("es-AR")}`
        suggestion = "Esperar o ejecutar manualmente"
      } else {
        diagnosis = "Schedule activo pero nunca ejecutado"
        suggestion = "Ejecutar manualmente o verificar cron de Vercel"
      }
    } else if (status === "error" || status === "delayed") {
      if (lastRun?.status === "failed") {
        const err = lastRun.error_message ?? ""
        if (err.includes("timeout") || err.includes("canceling statement")) {
          diagnosis = "Último run falló por timeout"
          suggestion = "Verificar URL de descarga y tamaño del archivo"
        } else if (err.includes("404") || err.includes("Not Found")) {
          diagnosis = "Error 404 — archivo no encontrado"
          suggestion = "Verificar URL de la fuente"
        } else if (err.includes("401") || err.includes("403") || err.includes("Unauthorized")) {
          diagnosis = "Error de autenticación con el proveedor"
          suggestion = "Verificar credenciales de la fuente"
        } else if (err.includes("parse") || err.includes("CSV") || err.includes("delimiter")) {
          diagnosis = "Error parsing del archivo"
          suggestion = "Verificar formato/delimitador del archivo"
        } else if (err) {
          diagnosis = `Error: ${err.slice(0, 100)}`
          suggestion = "Reintentar import manual"
        } else {
          diagnosis = "Falló sin mensaje de error"
          suggestion = "Reintentar import manual"
        }
      } else if (lastRun?.status === "completed" && lastRun?.rows_failed > 0) {
        diagnosis = `Completó con ${lastRun.rows_failed} errores de ${lastRun.rows_processed} procesados`
        suggestion = "Revisar datos del archivo fuente"
      } else {
        diagnosis = `No se ejecuta hace ${Math.round(hoursSinceRun ?? 0)}h`
        suggestion = "Verificar que el cron import-schedules esté activo en Vercel"
      }
    }

    return {
      source_id: source.id,
      source_name: source.name,
      source_key: source.source_key,
      feed_type: source.feed_type,
      status,
      schedule: schedule ? {
        enabled: schedule.enabled,
        frequency: schedule.frequency,
        hour: schedule.hour,
        minute: schedule.minute,
        timezone: schedule.timezone,
        last_run_at: schedule.last_run_at,
        next_run_at: schedule.next_run_at,
      } : null,
      last_run: lastRun ? {
        status: lastRun.status,
        started_at: lastRun.started_at,
        duration_ms: lastRun.duration_ms,
        rows_processed: lastRun.rows_processed,
        rows_updated: lastRun.rows_updated,
        rows_failed: lastRun.rows_failed,
        error: lastRun.error_message,
      } : null,
      hours_since_run: hoursSinceRun !== null ? Math.round(hoursSinceRun) : null,
      diagnosis,
      suggestion,
    }
  })

  // Also include scheduled-only sources (have schedule but might not be in sourcesActive)
  const scheduleOnlySources = (allSchedules ?? [])
    .filter((s: any) => s.enabled && !sourceDiagnostics.some((d: any) => d.source_id === s.source_id))
    .map((s: any) => ({
      source_id: s.source_id,
      source_name: (s.import_sources as any)?.name ?? "—",
      source_key: (s.import_sources as any)?.source_key ?? null,
      feed_type: (s.import_sources as any)?.feed_type ?? null,
      status: "ok" as const,
      schedule: { enabled: s.enabled, frequency: s.frequency, hour: s.hour, minute: s.minute, timezone: s.timezone, last_run_at: s.last_run_at, next_run_at: s.next_run_at },
      last_run: null,
      hours_since_run: s.last_run_at ? Math.round((now.getTime() - new Date(s.last_run_at).getTime()) / 3600000) : null,
      diagnosis: null,
      suggestion: null,
    }))

  const allSourceDiagnostics = [...sourceDiagnostics, ...scheduleOnlySources]

  // Alerts
  const alerts: Array<{ type: string; message: string; href: string; severity: "error" | "warning" | "info" }> = []

  if ((salesBlocked.count ?? 0) > 0)
    alerts.push({ type: "sales", message: `${salesBlocked.count} pedido(s) bloqueado(s) por falta de EAN`, href: "/sales?filter=missing_ean", severity: "error" })
  if ((salesFailed.count ?? 0) > 0)
    alerts.push({ type: "sales", message: `${salesFailed.count} pedido(s) con error de export a Libral`, href: "/sales?filter=failed", severity: "error" })
  // Source-specific alerts with diagnosis
  for (const diag of allSourceDiagnostics) {
    if (diag.status === "error" && diag.diagnosis) {
      alerts.push({ type: "sources", message: `${diag.source_name}: ${diag.diagnosis}`, href: "/inventory/sources", severity: "error" })
    } else if (diag.status === "delayed" && diag.diagnosis) {
      alerts.push({ type: "sources", message: `${diag.source_name}: ${diag.diagnosis}`, href: "/inventory/sources", severity: "warning" })
    } else if (diag.status === "disabled" && diag.diagnosis) {
      alerts.push({ type: "sources", message: `${diag.source_name}: ${diag.diagnosis}`, href: "/inventory/sources", severity: "warning" })
    }
  }

  const mlMissingConfig = mlAccounts.filter((a: any) => !a.platform_code || !a.empresa_id)
  if (mlMissingConfig.length > 0)
    alerts.push({ type: "accounts", message: `${mlMissingConfig.length} cuenta(s) ML sin platform_code o empresa`, href: "/integrations", severity: "warning" })

  const spMissingConfig = shopifyStores.filter((s: any) => !s.platform_code || !s.empresa_id)
  if (spMissingConfig.length > 0)
    alerts.push({ type: "accounts", message: `${spMissingConfig.length} tienda(s) Shopify sin platform_code o empresa`, href: "/integrations/shopify-stores", severity: "warning" })

  const expiredAccounts = mlAccounts.filter((a: any) => a.tokenExpired)
  if (expiredAccounts.length > 0)
    alerts.push({ type: "accounts", message: `${expiredAccounts.length} cuenta(s) ML con token expirado`, href: "/integrations", severity: "error" })

  return NextResponse.json({
    sales: {
      last_24h: salesTotal.count ?? 0,
      pending_export: salesPending.count ?? 0,
      export_blocked: salesBlocked.count ?? 0,
      failed: salesFailed.count ?? 0,
      sent_today: salesSentToday.count ?? 0,
    },
    stock: {
      products_with_stock: productsWithStock.count ?? 0,
      products_total: productsTotal.count ?? 0,
      sources_active: (sourcesActive.data ?? []).length,
    },
    libral_exports: {
      today: (exportsToday.data ?? []).length,
      exports: exportsToday.data ?? [],
    },
    sources: allSourceDiagnostics,
    accounts: {
      ml: mlAccounts,
      shopify: shopifyStores,
      ml_total: mlAccounts.length,
      shopify_total: shopifyStores.length,
      ml_missing_config: mlMissingConfig.length,
      shopify_missing_config: spMissingConfig.length,
      ml_expired: expiredAccounts.length,
    },
    catalog: {
      ml_publications: mlPubsTotal.count ?? 0,
      ml_no_sku: mlPubsNoSku.count ?? 0,
    },
    alerts,
    logs: (processRuns.data ?? []).map((r: any) => ({
      id: r.id,
      type: r.process_type,
      name: r.process_name,
      status: r.status,
      started_at: r.started_at,
      duration_ms: r.duration_ms,
      processed: r.rows_processed,
      updated: r.rows_updated,
      failed: r.rows_failed,
      error: r.error_message,
    })),
  })
}
