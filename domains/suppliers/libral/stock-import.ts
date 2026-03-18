/**
 * runLibralStockImport
 *
 * Standalone stock-update import for Libral Argentina.
 * Uses the service-role admin client so it can run from cron jobs
 * or any server context without requiring a user session / cookie.
 *
 * Strategy:
 *  - Fetch all active Libral products in 1000-item pages
 *  - For each EAN, upsert products.stock_by_source[sourceKey]
 *  - Recalculate products.stock as sum of all stock_by_source entries
 *  - Products not in the Libral response get their libral key zeroed out
 */

import { createAdminClient } from "@/lib/db/admin"
import { authenticateLibral, isLibralTokenValid, queryLibralProducts } from "@/domains/suppliers/libral/client"
import { mergeStockBySource } from "@/domains/inventory/stock-helpers"

const PAGE_SIZE = 1000
const UPSERT_CHUNK = 500

export interface LibralImportResult {
  success: boolean
  updated: number
  zeroed: number
  errors: number
  elapsed_seconds: number
  error?: string
}

export async function runLibralStockImport(
  sourceKey = "libral"
): Promise<LibralImportResult> {
  const start = Date.now()
  const supabase = createAdminClient()

  // ── 1. Get / refresh JWT token via integration_configs ──────────────────────
  const { data: config, error: configErr } = await supabase
    .from("integration_configs")
    .select("credentials, token, token_expires_at")
    .eq("integration_name", "libral")
    .eq("is_active", true)
    .single()

  if (configErr || !config) {
    return {
      success: false,
      updated: 0,
      zeroed: 0,
      errors: 0,
      elapsed_seconds: 0,
      error: "Libral integration not configured in integration_configs",
    }
  }

  let token: string
  if (config.token && isLibralTokenValid(config.token_expires_at)) {
    token = config.token
  } else {
    const creds = config.credentials as { username: string; password: string }
    const auth = await authenticateLibral(creds.username, creds.password)
    token = auth.token
    await supabase
      .from("integration_configs")
      .update({ token: auth.token, token_expires_at: auth.expires_at })
      .eq("integration_name", "libral")
  }

  // ── 2. Fetch all active products from Libral in pages ───────────────────────
  let page = 0
  let hasMore = true
  const allEans = new Set<string>()
  const stockMap = new Map<string, number>() // ean → stock_disponible

  while (hasMore) {
    const result = await queryLibralProducts(token, {
      take: PAGE_SIZE,
      skip: page * PAGE_SIZE,
      select: ["id", "ean", "stockdisponibletotal", "activo"],
      filter: ["activo", "=", "true"],
      requireTotalCount: page === 0,
    })

    for (const p of result.data) {
      if (!p.ean) continue
      allEans.add(p.ean)
      stockMap.set(p.ean, p.stockdisponibletotal ?? 0)
    }

    hasMore = result.data.length === PAGE_SIZE
    page++

    if (page === 1) {
      console.log(`[LIBRAL-IMPORT] Total en Libral: ${result.totalCount ?? "?"}, páginas estimadas: ${Math.ceil((result.totalCount ?? 0) / PAGE_SIZE)}`)
    }
  }

  console.log(`[LIBRAL-IMPORT] ${allEans.size} EANs activos descargados en ${page} páginas`)

  // ── 3. Update products in batches using stock_by_source ─────────────────────
  const eanArray = Array.from(allEans)
  let updated = 0
  let errors = 0

  for (let i = 0; i < eanArray.length; i += UPSERT_CHUNK) {
    const chunk = eanArray.slice(i, i + UPSERT_CHUNK)

    // Fetch existing stock_by_source for this chunk
    const { data: existing } = await supabase
      .from("products")
      .select("id, ean, stock_by_source")
      .in("ean", chunk)

    if (!existing || existing.length === 0) continue

    const updates = existing.map((p: any) => {
      const libralStock = stockMap.get(p.ean) ?? 0
      const { stock_by_source, stock } = mergeStockBySource(p.stock_by_source, sourceKey, libralStock)
      return { id: p.id, stock, stock_by_source }
    })

    const { error: upsertErr } = await supabase
      .from("products")
      .upsert(updates, { onConflict: "id" })

    if (upsertErr) {
      console.error(`[LIBRAL-IMPORT] Upsert error chunk ${i}:`, upsertErr.message)
      errors += chunk.length
    } else {
      updated += updates.length
    }
  }

  // ── 4. Zero out stock for products NOT in Libral's response ─────────────────
  // Only zero products that currently have a non-zero libral key
  let zeroed = 0
  const { data: withLibralStock } = await supabase
    .from("products")
    .select("id, ean, stock_by_source")
    .not(`stock_by_source->>${sourceKey}`, "is", null)
    .gt(`stock_by_source->>${sourceKey}`, "0")

  const toZero = (withLibralStock ?? []).filter((p: any) => !allEans.has(p.ean))

  for (let i = 0; i < toZero.length; i += UPSERT_CHUNK) {
    const chunk = toZero.slice(i, i + UPSERT_CHUNK)
    const updates = chunk.map((p: any) => {
      const { stock_by_source, stock } = mergeStockBySource(p.stock_by_source, sourceKey, 0)
      return { id: p.id, stock, stock_by_source }
    })
    await supabase.from("products").upsert(updates, { onConflict: "id" })
    zeroed += chunk.length
  }

  const elapsed = Math.round((Date.now() - start) / 1000)
  console.log(`[LIBRAL-IMPORT] Completado: ${updated} actualizados, ${zeroed} en cero, ${errors} errores. ${elapsed}s`)

  return { success: true, updated, zeroed, errors, elapsed_seconds: elapsed }
}
