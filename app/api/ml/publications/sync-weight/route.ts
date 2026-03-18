import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { protectAPI } from "@/lib/auth/protect-api"

export const maxDuration = 60

const ML_API          = "https://api.mercadolibre.com"
const MULTIGET_MAX    = 20 // keep requests small; ML multiget max is 20 items
const INTER_REQ_MS    = 120
const RATE_LIMIT_WAIT = 60_000

// ── Weight extraction ────────────────────────────────────────────────────────

/**
 * Extracts weight in grams from an ML item response.
 *
 * ML returns dimensions on the item as:
 *   item.shipping.dimensions.weight (string, grams)       — most common
 *   item.attributes[].id === "WEIGHT" .value_struct.number + .unit
 *   item.shipping.local_pick_up / free_methods (no weight there)
 *
 * Returns null if no weight can be determined.
 */
export function extractWeightGramsFromItem(item: any): number | null {
  // 1. shipping.dimensions.weight (already in grams as a number or string)
  const dimWeight = item?.shipping?.dimensions?.weight
  if (dimWeight != null) {
    const n = typeof dimWeight === "string" ? parseFloat(dimWeight) : dimWeight
    if (isFinite(n) && n > 0) return Math.round(n)
  }

  // 2. attributes[] — look for WEIGHT attribute
  const attrs: any[] = item?.attributes ?? []
  const weightAttr = attrs.find(
    (a: any) => a.id === "WEIGHT" || a.id === "ITEM_CONDITION",
  )
  if (weightAttr) {
    // value_struct: { number, unit }
    const vs = weightAttr.value_struct
    if (vs?.number != null && isFinite(vs.number) && vs.number > 0) {
      const unit: string = (vs.unit ?? "g").toLowerCase()
      if (unit === "g")  return Math.round(vs.number)
      if (unit === "kg") return Math.round(vs.number * 1000)
      if (unit === "lb") return Math.round(vs.number * 453.592)
      if (unit === "oz") return Math.round(vs.number * 28.3495)
    }
    // plain value_name fallback e.g. "350 g"
    const raw = weightAttr.value_name as string | undefined
    if (raw) {
      const m = raw.match(/^([\d.]+)\s*(g|kg|lb|oz)?/i)
      if (m) {
        const num  = parseFloat(m[1])
        const unit = (m[2] ?? "g").toLowerCase()
        if (isFinite(num) && num > 0) {
          if (unit === "g")  return Math.round(num)
          if (unit === "kg") return Math.round(num * 1000)
          if (unit === "lb") return Math.round(num * 453.592)
          if (unit === "oz") return Math.round(num * 28.3495)
        }
      }
    }
  }

  return null
}

// ── Rate-limit helper ────────────────────────────────────────────────────────

async function consumeRateLimit(supabase: any, accountId: string, cost = 1) {
  const WINDOW_MS = 60_000
  const LIMIT     = 500
  const windowStart = new Date(
    Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS,
  ).toISOString()

  const { data: row } = await supabase
    .from("ml_rate_limits")
    .select("tokens_used, window_start")
    .eq("account_id", accountId)
    .maybeSingle()

  const sameWindow = row?.window_start === windowStart
  const used       = sameWindow ? (row?.tokens_used ?? 0) : 0

  if (used + cost > LIMIT) {
    const nextWindow =
      Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS + WINDOW_MS
    await new Promise((r) =>
      setTimeout(r, Math.max(0, nextWindow - Date.now()) + 100),
    )
  }

  await supabase.from("ml_rate_limits").upsert(
    {
      account_id:   accountId,
      window_start: windowStart,
      tokens_used:  used + cost,
      tokens_limit: LIMIT,
      updated_at:   new Date().toISOString(),
    },
    { onConflict: "account_id" },
  )
}

// ── POST /api/ml/publications/sync-weight ────────────────────────────────────
/**
 * Body: { account_id: string, batch_size?: number, force?: boolean }
 *
 * Finds publications for that account that have a product_id and
 * whose product.canonical_weight_g is null (or force=true to re-sync all).
 * Fetches ML items in multiget batches, extracts weight, updates:
 *   - ml_publications.meli_weight_g
 *   - ml_publications.weight_source = 'meli'
 *   - ml_publications.weight_last_synced_at
 *   - products.canonical_weight_g  (only if product currently has no weight)
 *   - products.weight_updated_at
 *   - products.weight_confidence = 0.9 (high confidence from ML dimensions)
 */
export async function POST(request: NextRequest) {
  const authCheck = await protectAPI()
  if (authCheck.error) return authCheck.response

  const start = Date.now()

  try {
    const body = await request.json()
    const {
      account_id,
      batch_size = 50,
      force      = false,
    } = body as {
      account_id: string
      batch_size?: number
      force?: boolean
    }

    if (!account_id) {
      return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
    }

    const supabase = await createClient()
    const token    = await getValidAccessToken(account_id)

    // ── Query publications ─────────────────────────────────────────────────
    // Join with products to check canonical_weight_g
    let q = supabase
      .from("ml_publications")
      .select("id, ml_item_id, product_id, meli_weight_g")
      .eq("account_id", account_id)
      .not("product_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(Math.min(batch_size, 200))

    if (!force) {
      q = q.is("meli_weight_g", null)
    }

    const { data: pubs, error: pubsErr } = await q
    if (pubsErr) throw pubsErr

    if (!pubs || pubs.length === 0) {
      return NextResponse.json({
        ok:        true,
        processed: 0,
        updated:   0,
        missing:   0,
        elapsed:   ((Date.now() - start) / 1000).toFixed(1),
        message:   "No hay publicaciones pendientes de sincronizar.",
      })
    }

    console.log(`[WEIGHT-SYNC] Starting sync for ${pubs.length} publications, account=${account_id}`)

    let processed = 0
    let updated   = 0
    let missing   = 0
    let errors    = 0

    // ── Process in multiget chunks ─────────────────────────────────────────
    const chunks: typeof pubs[] = []
    for (let i = 0; i < pubs.length; i += MULTIGET_MAX) {
      chunks.push(pubs.slice(i, i + MULTIGET_MAX))
    }

    for (const chunk of chunks) {
      const ids = chunk.map((p: any) => p.ml_item_id).join(",")

      await consumeRateLimit(supabase, account_id, chunk.length)

      const url = `${ML_API}/items?ids=${ids}&attributes=id,shipping,attributes`
      let res: Response
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal:  AbortSignal.timeout(20_000),
        })
      } catch (e: any) {
        console.warn(`[WEIGHT-SYNC] Fetch error for chunk: ${e.message}`)
        errors += chunk.length
        continue
      }

      if (res.status === 429) {
        console.warn("[WEIGHT-SYNC] Rate limited — pausing 60s")
        await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT))
        // Retry once
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }

      if (!res.ok) {
        console.warn(`[WEIGHT-SYNC] ML error: HTTP ${res.status}`)
        errors += chunk.length
        continue
      }

      const results: any[] = await res.json()
      processed += chunk.length

      for (const entry of results) {
        // ML multiget wraps each item as { code, body }
        const item = entry?.body ?? entry
        if (!item?.id) { missing++; continue }

        const weightG = extractWeightGramsFromItem(item)

        // Find matching pub
        const pub = chunk.find((p: any) => p.ml_item_id === item.id)
        if (!pub) continue

        if (weightG == null) {
          console.log(`[WEIGHT-SYNC] No weight found for ${item.id}`)
          missing++
          // Still mark as synced so we don't retry every time
          await supabase
            .from("ml_publications")
            .update({
              weight_last_synced_at: new Date().toISOString(),
              weight_source:         "meli",
            })
            .eq("id", pub.id)
          continue
        }

        // Update ml_publications
        const { error: pubErr } = await supabase
          .from("ml_publications")
          .update({
            meli_weight_g:         weightG,
            weight_source:         "meli",
            weight_last_synced_at: new Date().toISOString(),
          })
          .eq("id", pub.id)

        if (pubErr) {
          console.error(`[WEIGHT-SYNC] pub update error ${pub.id}:`, pubErr)
          errors++
          continue
        }

        // Update products.canonical_weight_g only if not already set (or force)
        if (pub.product_id) {
          const updatePayload: Record<string, any> = {
            weight_updated_at: new Date().toISOString(),
            weight_confidence: 0.9,
          }
          // Only overwrite canonical_weight_g if currently null or force
          if (force) {
            updatePayload.canonical_weight_g = weightG
          } else {
            // Conditional update: only when null
            const { error: prodErr } = await supabase
              .from("products")
              .update({ ...updatePayload, canonical_weight_g: weightG })
              .eq("id", pub.product_id)
              .is("canonical_weight_g", null)
            if (prodErr) console.warn(`[WEIGHT-SYNC] products update error ${pub.product_id}:`, prodErr)
          }

          if (force) {
            const { error: prodErr } = await supabase
              .from("products")
              .update({ ...updatePayload, canonical_weight_g: weightG })
              .eq("id", pub.product_id)
            if (prodErr) console.warn(`[WEIGHT-SYNC] products force update error:`, prodErr)
          }
        }

        updated++
        console.log(`[WEIGHT-SYNC] ${item.id} → ${weightG}g`)
      }

      await new Promise((r) => setTimeout(r, INTER_REQ_MS))
    }

    console.log(`[WEIGHT-SYNC] Done. processed=${processed} updated=${updated} missing=${missing} errors=${errors}`)

    return NextResponse.json({
      ok:        true,
      processed,
      updated,
      missing,
      errors,
      elapsed:   ((Date.now() - start) / 1000).toFixed(1),
    })
  } catch (err: any) {
    console.error("[WEIGHT-SYNC] Unexpected error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
