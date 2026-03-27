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
    // Accounts
    supabase
      .from("ml_accounts")
      .select("id, nickname, token_expires_at, platform_code, empresa_id")
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

  // Process ML accounts - handle missing columns gracefully
  const mlAccounts = (mlAccountsResult.data ?? []).map((a: any) => ({
    id: a.id,
    nickname: a.nickname,
    tokenExpired: new Date(a.token_expires_at) <= new Date(),
    platform_code: a.platform_code ?? null,
    empresa_id: a.empresa_id ?? null,
  }))

  const shopifyStores = (shopifyStoresResult.data ?? []).map((s: any) => ({
    id: s.id,
    name: s.name ?? s.shop_domain,
    platform_code: s.platform_code ?? null,
    empresa_id: s.empresa_id ?? null,
  }))

  // Build schedules with status
  const now = new Date()
  const schedules = (sourcesLastRuns.data ?? []).map((s: any) => {
    const lastRun = s.last_run_at ? new Date(s.last_run_at) : null
    const hoursSinceRun = lastRun ? (now.getTime() - lastRun.getTime()) / 3600000 : null
    let status = "ok"
    if (!lastRun) status = "never_run"
    else if (hoursSinceRun! > 48) status = "error"
    else if (hoursSinceRun! > 25) status = "delayed"

    return {
      id: s.id,
      source_id: s.source_id,
      source_name: (s.import_sources as any)?.name ?? "—",
      frequency: s.frequency,
      hour: s.hour,
      minute: s.minute,
      last_run_at: s.last_run_at,
      next_run_at: s.next_run_at,
      status,
    }
  })

  // Alerts
  const alerts: Array<{ type: string; message: string; href: string; severity: "error" | "warning" | "info" }> = []

  if ((salesBlocked.count ?? 0) > 0)
    alerts.push({ type: "sales", message: `${salesBlocked.count} pedido(s) bloqueado(s) por falta de EAN`, href: "/sales?filter=missing_ean", severity: "error" })
  if ((salesFailed.count ?? 0) > 0)
    alerts.push({ type: "sales", message: `${salesFailed.count} pedido(s) con error de export a Libral`, href: "/sales?filter=failed", severity: "error" })
  if (schedules.some((s) => s.status === "error"))
    alerts.push({ type: "sources", message: "Fuentes sin ejecutar en >48h", href: "/inventory/sources", severity: "error" })
  if (schedules.some((s) => s.status === "delayed"))
    alerts.push({ type: "sources", message: "Fuentes con ejecución retrasada (>25h)", href: "/inventory/sources", severity: "warning" })

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
    schedules,
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
