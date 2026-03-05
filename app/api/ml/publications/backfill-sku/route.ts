import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

const ML_API            = "https://api.mercadolibre.com"
const MULTIGET_MAX_IDS  = 20
const INTER_BATCH_MS    = 120

/**
 * POST /api/ml/publications/backfill-sku
 * Body: { account_id: string, batch_size?: number, force?: boolean }
 *
 * Fetches ML items in batches, extracts SKU from:
 *   1. seller_custom_field  (most reliable)
 *   2. variations[].seller_custom_field
 *   3. attributes[SELLER_SKU]
 * Updates ml_publications.sku for rows where sku IS NULL (or all if force=true).
 */
export async function POST(req: NextRequest) {
  try {
    const body       = await req.json()
    const accountId  = body.account_id as string | undefined
    const batchSize  = Math.min(Number(body.batch_size ?? 100), 500)
    const force      = Boolean(body.force ?? false)
    const offset     = Number(body.offset ?? 0)

    if (!accountId) {
      return NextResponse.json({ ok: false, error: "account_id requerido" }, { status: 400 })
    }

    const supabase = await createClient()
    const token    = await getValidAccessToken(accountId)

    // ── Fetch publications that need a SKU ──────────────────────────────────
    let q = supabase
      .from("ml_publications")
      .select("id, ml_item_id, sku")
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + batchSize - 1)

    if (!force) q = q.is("sku", null)

    const { data: pubs, error: pubsErr } = await q
    if (pubsErr) throw pubsErr
    if (!pubs || pubs.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, skipped: 0, errors: 0, has_more: false, offset })
    }

    const itemIds = pubs.map((p: any) => p.ml_item_id)

    // ── Multiget from ML in chunks ──────────────────────────────────────────
    const skuMap: Record<string, string | null> = {}
    let errors = 0

    for (let i = 0; i < itemIds.length; i += MULTIGET_MAX_IDS) {
      const chunk = itemIds.slice(i, i + MULTIGET_MAX_IDS)
      const attrs = "id,seller_custom_field,attributes,variations"
      const url   = `${ML_API}/items?ids=${chunk.join(",")}&attributes=${attrs}`

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal:  AbortSignal.timeout(15_000),
      })

      if (res.status === 429) {
        // Rate limited — stop here and let the caller retry with offset
        return NextResponse.json({
          ok: false,
          error: "rate_limited",
          updated: Object.values(skuMap).filter(Boolean).length,
          offset: offset + i,
          has_more: true,
        }, { status: 429 })
      }

      if (!res.ok) { errors += chunk.length; continue }

      const data: any[] = await res.json()

      for (const entry of data) {
        if (entry.code !== 200 || !entry.body) { errors++; continue }
        const b   = entry.body
        let sku: string | null = null

        // 1. seller_custom_field at item level
        if (b.seller_custom_field) sku = b.seller_custom_field

        // 2. variations[0].seller_custom_field
        if (!sku && Array.isArray(b.variations)) {
          for (const v of b.variations) {
            if (v.seller_custom_field) { sku = v.seller_custom_field; break }
          }
        }

        // 3. attributes SELLER_SKU
        if (!sku && Array.isArray(b.attributes)) {
          for (const attr of b.attributes) {
            if (attr.id === "SELLER_SKU" && attr.value_name) { sku = attr.value_name; break }
          }
        }

        skuMap[b.id] = sku
      }

      if (i + MULTIGET_MAX_IDS < itemIds.length) {
        await new Promise(r => setTimeout(r, INTER_BATCH_MS))
      }
    }

    // ── Update rows ──────────────────────────────────────────────────────────
    let updated = 0
    let skipped = 0

    for (const pub of pubs) {
      const sku = skuMap[pub.ml_item_id]
      if (sku == null) { skipped++; continue }
      if (!force && pub.sku === sku) { skipped++; continue }

      const { error: upErr } = await supabase
        .from("ml_publications")
        .update({ sku, updated_at: new Date().toISOString() })
        .eq("id", pub.id)

      if (upErr) { errors++; continue }
      updated++
    }

    const hasMore    = pubs.length === batchSize
    const nextOffset = offset + pubs.length

    return NextResponse.json({
      ok: true,
      updated,
      skipped,
      errors,
      processed: pubs.length,
      has_more: hasMore,
      next_offset: nextOffset,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
