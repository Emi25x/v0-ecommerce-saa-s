/**
 * Libral Order Export Service
 *
 * Orchestrates batch export, manual push, and cancellation flows.
 * Uses admin client for all DB operations (runs from cron/server context).
 */

import { createAdminClient } from "@/lib/db/admin"
import { createLibralOrder, deleteLibralOrder } from "./client"
import { mapOrderToLibralPayload } from "./mapper"
import type { BatchExportResult } from "./types"

type SupabaseAdmin = ReturnType<typeof createAdminClient>

// ── Batch Export ─────────────────────────────────────────────────────────────

/**
 * Export all eligible orders for a given date window to Libral.
 * Called by the daily cron at 06:00 Argentina time.
 *
 * @param dateFrom - ISO string, start of window (inclusive)
 * @param dateTo - ISO string, end of window (exclusive)
 */
export async function runBatchExport(dateFrom: string, dateTo: string): Promise<BatchExportResult> {
  const supabase = createAdminClient()

  // 1. Find eligible orders: confirmed/paid, not cancelled, in date window, not yet sent
  const { data: orders, error: fetchErr } = await supabase
    .from("orders")
    .select(`
      id, platform, platform_code, platform_order_id, company_name,
      customer_address, order_date, status, payment_status,
      libral_reference, libral_status
    `)
    .gte("order_date", dateFrom)
    .lt("order_date", dateTo)
    .in("status", ["confirmed", "paid", "shipped", "delivered"])
    .not("status", "eq", "cancelled")
    .in("libral_status", ["not_ready", "pending_export", "export_blocked", "failed"])

  if (fetchErr || !orders) {
    return { success: false, total_eligible: 0, exported: 0, failed: 0, blocked: 0, errors: [{ order_id: "", reference: "", error: fetchErr?.message ?? "Query failed" }] }
  }

  // 2. Pre-fill platform_code/company_name from account config if missing
  await enrichOrdersFromAccounts(supabase, orders)

  // 3. Fetch items for all orders
  const orderIds = orders.map((o) => o.id)
  const { data: allItems } = await supabase
    .from("order_items")
    .select("id, order_id, ean, sku, title, quantity")
    .in("order_id", orderIds)

  const itemsByOrder = new Map<string, typeof allItems>()
  for (const item of allItems ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? []
    list.push(item)
    itemsByOrder.set(item.order_id, list)
  }

  // 4. Process each order
  let exported = 0
  let failed = 0
  let blocked = 0
  const errors: BatchExportResult["errors"] = []

  for (const order of orders) {
    const items = itemsByOrder.get(order.id) ?? []
    const result = mapOrderToLibralPayload({
      platform_code: order.platform_code,
      platform_order_id: order.platform_order_id,
      company_name: order.company_name,
      order_date: order.order_date,
      customer_address: order.customer_address,
      items: items.map((i) => ({ ean: i.ean, quantity: i.quantity })),
    })

    if ("error" in result) {
      // Blocked — missing EAN, platform_code, or company_name
      blocked++
      const blockStatus = result.error.includes("EAN") ? "export_blocked" : "not_ready"
      await supabase
        .from("orders")
        .update({ libral_status: blockStatus, export_error: result.error })
        .eq("id", order.id)
      continue
    }

    // 5. Send to Libral
    const { payload, reference } = result
    const libralResult = await createLibralOrder(payload)

    // 6. Record in audit table
    await supabase.from("libral_order_exports").upsert(
      {
        order_id: order.id,
        platform_code: order.platform_code!,
        reference,
        action: "create",
        status: libralResult.success ? "sent" : "failed",
        payload_json: payload,
        response_text: libralResult.response,
        attempts: 1,
        last_error: libralResult.error ?? null,
        sent_at: libralResult.success ? new Date().toISOString() : null,
      },
      { onConflict: "reference" },
    )

    // 7. Update order
    if (libralResult.success) {
      exported++
      await supabase
        .from("orders")
        .update({
          libral_reference: reference,
          libral_status: "sent",
          sent_to_libral: true,
          libral_sent_at: new Date().toISOString(),
          export_error: null,
          last_export_attempt_at: new Date().toISOString(),
        })
        .eq("id", order.id)
    } else {
      failed++
      errors.push({ order_id: order.id, reference, error: libralResult.error ?? "Unknown" })
      await supabase
        .from("orders")
        .update({
          libral_reference: reference,
          libral_status: "failed",
          export_error: libralResult.error,
          last_export_attempt_at: new Date().toISOString(),
        })
        .eq("id", order.id)
    }
  }

  return {
    success: true,
    total_eligible: orders.length,
    exported,
    failed,
    blocked,
    errors,
  }
}

// ── Manual Push ──────────────────────────────────────────────────────────────

/**
 * Manually export a single order to Libral.
 * Used after correcting EAN, mapping, or retrying a failed export.
 */
export async function pushOrderToLibral(orderId: string): Promise<{
  success: boolean
  reference?: string
  error?: string
}> {
  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from("orders")
    .select("id, platform, platform_code, platform_order_id, company_name, customer_address, order_date, status")
    .eq("id", orderId)
    .single()

  if (!order) return { success: false, error: "Orden no encontrada" }
  if (order.status === "cancelled") return { success: false, error: "Orden cancelada" }

  // Enrich from account if missing
  await enrichOrdersFromAccounts(supabase, [order])

  const { data: items } = await supabase
    .from("order_items")
    .select("ean, quantity")
    .eq("order_id", orderId)

  const result = mapOrderToLibralPayload({
    platform_code: order.platform_code,
    platform_order_id: order.platform_order_id,
    company_name: order.company_name,
    order_date: order.order_date,
    customer_address: order.customer_address,
    items: (items ?? []).map((i) => ({ ean: i.ean, quantity: i.quantity })),
  })

  if ("error" in result) return { success: false, error: result.error }

  const { payload, reference } = result
  const libralResult = await createLibralOrder(payload)

  // Audit
  const { data: existing } = await supabase
    .from("libral_order_exports")
    .select("attempts")
    .eq("reference", reference)
    .maybeSingle()

  await supabase.from("libral_order_exports").upsert(
    {
      order_id: orderId,
      platform_code: order.platform_code!,
      reference,
      action: "create",
      status: libralResult.success ? "sent" : "failed",
      payload_json: payload,
      response_text: libralResult.response,
      attempts: (existing?.attempts ?? 0) + 1,
      last_error: libralResult.error ?? null,
      sent_at: libralResult.success ? new Date().toISOString() : null,
    },
    { onConflict: "reference" },
  )

  await supabase
    .from("orders")
    .update({
      libral_reference: reference,
      libral_status: libralResult.success ? "sent" : "failed",
      sent_to_libral: libralResult.success,
      libral_sent_at: libralResult.success ? new Date().toISOString() : undefined,
      export_error: libralResult.error ?? null,
      last_export_attempt_at: new Date().toISOString(),
    })
    .eq("id", orderId)

  return {
    success: libralResult.success,
    reference,
    error: libralResult.error,
  }
}

// ── Cancellation ─────────────────────────────────────────────────────────────

/**
 * Cancel an order in Libral that was already exported.
 * If the order was never sent, just marks it as cancelled_not_sent.
 */
export async function cancelOrderInLibral(orderId: string): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from("orders")
    .select("id, libral_reference, libral_status, sent_to_libral")
    .eq("id", orderId)
    .single()

  if (!order) return { success: false, error: "Orden no encontrada" }

  // Not yet sent — just mark as cancelled_not_sent
  if (!order.sent_to_libral || !order.libral_reference) {
    await supabase
      .from("orders")
      .update({ libral_status: "cancelled_not_sent", cancelled_at: new Date().toISOString() })
      .eq("id", orderId)
    return { success: true }
  }

  // Already sent — delete in Libral
  const libralResult = await deleteLibralOrder({ referencia: order.libral_reference })

  // Audit
  await supabase.from("libral_order_exports").insert({
    order_id: orderId,
    platform_code: order.libral_reference.split("-")[0],
    reference: order.libral_reference,
    action: "delete",
    status: libralResult.success ? "cancelled_in_erp" : "cancel_failed",
    response_text: libralResult.response,
    attempts: 1,
    last_error: libralResult.error ?? null,
    cancelled_at: libralResult.success ? new Date().toISOString() : null,
  })

  await supabase
    .from("orders")
    .update({
      libral_status: libralResult.success ? "cancelled_in_erp" : "cancel_failed",
      export_error: libralResult.error ?? null,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", orderId)

  return {
    success: libralResult.success,
    error: libralResult.error,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Enrich orders with platform_code and company_name from their account config.
 * Resolves company_name from arca_config.razon_social via empresa_id FK.
 * Mutates the orders array in place.
 */
async function enrichOrdersFromAccounts(supabase: SupabaseAdmin, orders: any[]): Promise<void> {
  const needsEnrichment = orders.filter((o) => !o.platform_code || !o.company_name)
  if (needsEnrichment.length === 0) return

  // Get all ML accounts with platform_code + empresa_id
  const { data: mlAccounts } = await supabase
    .from("ml_accounts")
    .select("id, platform_code, empresa_id")
    .not("platform_code", "is", null)

  // Get all Shopify stores with platform_code + empresa_id
  const { data: shopifyStores } = await supabase
    .from("shopify_stores")
    .select("id, platform_code, empresa_id")
    .not("platform_code", "is", null)

  // Collect all empresa_ids to resolve razon_social
  const empresaIds = new Set<string>()
  for (const a of mlAccounts ?? []) if (a.empresa_id) empresaIds.add(a.empresa_id)
  for (const s of shopifyStores ?? []) if (s.empresa_id) empresaIds.add(s.empresa_id)

  // Fetch razón social from arca_config
  const empresaMap = new Map<string, string>()
  if (empresaIds.size > 0) {
    const { data: empresas } = await supabase
      .from("arca_config")
      .select("id, razon_social")
      .in("id", Array.from(empresaIds))
    for (const e of empresas ?? []) {
      empresaMap.set(e.id, e.razon_social)
    }
  }

  const mlMap = new Map((mlAccounts ?? []).map((a) => [a.id, a]))
  const spMap = new Map((shopifyStores ?? []).map((s) => [s.id, s]))

  for (const order of needsEnrichment) {
    const accountConfig = order.platform === "mercadolibre"
      ? mlMap.get(order.account_id)
      : spMap.get(order.account_id)

    if (accountConfig) {
      const platformCode = order.platform_code || accountConfig.platform_code
      const empresaId = accountConfig.empresa_id
      const companyName = empresaId ? empresaMap.get(empresaId) ?? null : null

      order.platform_code = platformCode
      order.company_name = order.company_name || companyName

      // Persist enrichment to DB
      await supabase
        .from("orders")
        .update({
          platform_code: platformCode,
          empresa_id: empresaId ?? undefined,
          company_name: companyName ?? undefined,
          libral_reference: platformCode ? `${platformCode}-${order.platform_order_id}` : undefined,
        })
        .eq("id", order.id)
    }
  }
}
