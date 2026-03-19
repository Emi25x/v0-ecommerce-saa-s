/**
 * POST /api/market/scan/run
 * Procesa 1 batch del job: lee pubs con cursor, normaliza EANs, consulta ML, guarda snapshots.
 * Devuelve { done, cursor, scanned, skipped_cached, skipped_invalid, errors, job }
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
// mlFetchJson no se usa — búsqueda pública de ML no requiere Authorization

export const dynamic = "force-dynamic"
export const maxDuration = 55

const SITE_ID = "MLA"
const DELAY_MS = 250

/** Normalizar EAN a string 13 dígitos. Devuelve null si inválido. */
function normalizeEan(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = String(raw).trim()

  // Notación científica de Excel: 9.78845E+12
  if (/^[0-9]+\.?[0-9]*[eE][+\-]?[0-9]+$/i.test(s)) {
    s = Number(s).toFixed(0)
  }

  // Remover puntos/guiones
  s = s.replace(/[\.\-\s]/g, "")

  // Solo dígitos
  s = s.replace(/\D/g, "")

  if (!s) return null

  // Pad a 13 dígitos si tiene 12 (UPC → EAN-13)
  if (s.length === 12) s = s.padStart(13, "0")

  // ISBN-10 a EAN-13: agregar prefijo 978
  if (s.length === 10) s = "978" + s.slice(0, 9)

  if (s.length !== 13) return null

  return s
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

export async function POST(req: NextRequest) {
  const { job_id } = await req.json().catch(() => ({}))

  if (!job_id) {
    return NextResponse.json({ error: "job_id requerido" }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Cargar job
  const { data: job, error: jobErr } = await supabase.from("market_scan_jobs").select("*").eq("id", job_id).single()

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job no encontrado" }, { status: 404 })
  }

  if (job.status !== "running") {
    return NextResponse.json({ ok: true, done: true, reason: `job status=${job.status}`, job })
  }

  // Obtener access_token
  const { data: account } = await supabase
    .from("ml_accounts")
    .select("access_token, nickname")
    .eq("id", job.account_id)
    .single()

  if (!account?.access_token) {
    await supabase
      .from("market_scan_jobs")
      .update({ status: "failed", last_error: "sin access_token", ended_at: new Date().toISOString() })
      .eq("id", job_id)
    return NextResponse.json({ error: "Cuenta sin access_token" }, { status: 400 })
  }

  const cursor = job.cursor ?? 0
  const batchSize = job.batch_size ?? 200
  const today = new Date().toISOString().slice(0, 10)

  // Leer publicaciones con offset cursor
  const { data: pubs } = await supabase
    .from("ml_publications")
    .select("ean, isbn, gtin, title")
    .eq("account_id", job.account_id)
    .or("ean.not.is.null,isbn.not.is.null,gtin.not.is.null")
    .range(cursor, cursor + batchSize - 1)

  const batch = pubs ?? []

  console.log(`[MARKET-SCAN-RUN] job=${job_id} cursor=${cursor} batch=${batch.length} account=${account.nickname}`)

  if (batch.length === 0) {
    // No hay más publicaciones — job completo
    await supabase
      .from("market_scan_jobs")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
      })
      .eq("id", job_id)
    return NextResponse.json({
      ok: true,
      done: true,
      cursor,
      scanned: 0,
      skipped_cached: 0,
      skipped_invalid: 0,
      errors: 0,
      job: { ...job, status: "completed" },
    })
  }

  // Construir mapa EAN normalizado → título (deduplicar)
  const eanMap = new Map<string, string>()
  let skippedInvalidBatch = 0
  for (const p of batch) {
    // Prioridad: ean → isbn → gtin
    const rawEan = p.ean ?? p.isbn ?? p.gtin
    const normalized = normalizeEan(rawEan)
    if (!normalized) {
      skippedInvalidBatch++
      continue
    }
    if (!eanMap.has(normalized)) eanMap.set(normalized, p.title || "")
  }

  console.log(`[MARKET-SCAN-RUN] batch dedup: ${eanMap.size} EANs únicos, ${skippedInvalidBatch} inválidos`)
  console.log(`[MARKET-SCAN-RUN] sample: ${Array.from(eanMap.keys()).slice(0, 5).join(", ")}`)

  // Filtrar ya cacheados hoy
  const eanList = Array.from(eanMap.keys())
  const { data: cached } = await supabase
    .from("ml_market_snapshots")
    .select("ean")
    .eq("account_id", job.account_id)
    .eq("captured_day", today)
    .in("ean", eanList)

  const cachedSet = new Set((cached ?? []).map((r: any) => r.ean))
  const toScan = eanList.filter((e) => !cachedSet.has(e))

  console.log(`[MARKET-SCAN-RUN] toScan=${toScan.length} ya_cacheados=${cachedSet.size}`)

  let scanned = 0
  let errors = 0
  let firstErrorLogged = false

  for (const ean of toScan) {
    try {
      const url = `https://api.mercadolibre.com/sites/${SITE_ID}/search?q=${encodeURIComponent(ean)}&limit=50`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      let httpRes: Response
      try {
        httpRes = await fetch(url, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${account.access_token}`,
          },
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (!httpRes.ok) {
        const body = await httpRes.text()
        if (!firstErrorLogged) {
          console.error(
            `[MARKET-SCAN-RUN] PRIMER ERROR HTTP ${httpRes.status} EAN=${ean} url=${url} body=${body.slice(0, 400)}`,
          )
          firstErrorLogged = true
        }
        errors++
        await delay(DELAY_MS)
        continue
      }

      const res = await httpRes.json()

      const items: any[] = res.results ?? []
      if (items.length === 0) {
        await delay(DELAY_MS)
        continue
      }

      const prices = items
        .map((i: any) => i.price)
        .filter((p: any) => typeof p === "number" && p > 0)
        .sort((a: number, b: number) => a - b)
      const minPrice = prices[0] ?? null
      const avgPrice =
        prices.length > 0
          ? parseFloat((prices.reduce((s: number, p: number) => s + p, 0) / prices.length).toFixed(2))
          : null
      const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null
      const sellersCount = new Set(items.map((i: any) => i.seller?.id).filter(Boolean)).size
      const fullSellersCount = items.filter((i: any) => i.shipping?.free_shipping).length
      const freeShippingRate = items.length > 0 ? parseFloat((fullSellersCount / items.length).toFixed(4)) : 0
      const soldQtyProxy = items.reduce((s: number, i: any) => s + (i.sold_quantity ?? 0), 0)
      const categoryId = items[0]?.category_id ?? null
      const sampleItemIds = items.slice(0, 5).map((i: any) => i.id)

      const { error: upsertErr } = await supabase.from("ml_market_snapshots").upsert(
        {
          account_id: job.account_id,
          ean,
          category_id: categoryId,
          captured_at: new Date().toISOString(),
          captured_day: today,
          min_price: minPrice,
          median_price: medianPrice,
          avg_price: avgPrice,
          sellers_count: sellersCount,
          full_sellers_count: fullSellersCount,
          free_shipping_rate: freeShippingRate,
          sold_qty_proxy: soldQtyProxy,
          sample_item_ids: sampleItemIds,
        },
        { onConflict: "account_id,ean,captured_day", ignoreDuplicates: false },
      )

      if (upsertErr) {
        console.error(`[MARKET-SCAN-RUN] upsert error EAN ${ean}:`, upsertErr.message)
        errors++
      } else {
        scanned++
      }
    } catch (err: any) {
      const isTimeout = err?.name === "AbortError"
      if (!firstErrorLogged) {
        console.error(`[MARKET-SCAN-RUN] PRIMER EXCEPTION EAN=${ean} type=${err?.name} msg=${err?.message}`)
        firstErrorLogged = true
      }
      console.error(`[MARKET-SCAN-RUN] exception EAN=${ean} ${isTimeout ? "TIMEOUT" : err?.message}`)
      errors++
    }

    await delay(DELAY_MS)
  }

  const newCursor = cursor + batch.length
  const done = batch.length < batchSize // si trajo menos que el batch, terminó

  // Actualizar job
  await supabase
    .from("market_scan_jobs")
    .update({
      cursor: newCursor,
      status: done ? "completed" : "running",
      scanned: (job.scanned ?? 0) + scanned,
      skipped_cached: (job.skipped_cached ?? 0) + cachedSet.size,
      skipped_invalid: (job.skipped_invalid ?? 0) + skippedInvalidBatch,
      errors: (job.errors ?? 0) + errors,
      last_heartbeat_at: new Date().toISOString(),
      ...(done ? { ended_at: new Date().toISOString() } : {}),
    })
    .eq("id", job_id)

  const updatedJob = {
    ...job,
    cursor: newCursor,
    status: done ? "completed" : "running",
    scanned: (job.scanned ?? 0) + scanned,
  }

  console.log(`[MARKET-SCAN-RUN] done=${done} cursor=${newCursor} scanned=${scanned} errors=${errors}`)

  return NextResponse.json({
    ok: true,
    done,
    cursor: newCursor,
    scanned,
    skipped_cached: cachedSet.size,
    skipped_invalid: skippedInvalidBatch,
    errors,
    job: updatedJob,
  })
}
