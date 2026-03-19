/**
 * GET /api/radar/tendencias/ventas
 *
 * Retorna libros con ventas en alza comparando el período actual vs el anterior.
 *
 * Query params:
 *   source    = propias | categoria | vendedores   (default: propias)
 *   days      = 7 | 15 | 30                        (default: 7)
 *   limit     = 1–50                               (default: 20)
 *   account_id= UUID (opcional, solo para "propias" — filtra una cuenta específica)
 *   category_id = texto (opcional, default: MLA1144)
 *
 * Para "propias": usa orders + order_items (todas las cuentas o una sola).
 * Para "categoria" / "vendedores": usa snapshots diarios de ML API.
 *   Si no hay snapshot de hoy, lo toma en tiempo real y lo persiste.
 *   El δ se calcula contra el snapshot más antiguo disponible dentro del período.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

export const maxDuration = 60

const DEFAULT_CATEGORY = "MLA1144" // Libros y Revistas – Argentina
const ML_SEARCH_LIMIT = 50 // items por llamada ML search

// ── helpers ─────────────────────────────────────────────────────────────────

function periodDates(days: number) {
  const now = new Date()
  const curStart = new Date(now.getTime() - days * 86_400_000)
  const prevStart = new Date(now.getTime() - days * 2 * 86_400_000)
  return { now, curStart, prevStart }
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** Agrega order_items en un Map<key, { title, sku, qty, total }> */
function aggregateItems(items: any[]) {
  const m = new Map<string, { title: string; sku: string | null; qty: number; total: number }>()
  for (const row of items ?? []) {
    const key = row.sku || row.title || ""
    const e = m.get(key) ?? { title: row.title, sku: row.sku ?? null, qty: 0, total: 0 }
    e.qty += Number(row.quantity) || 0
    e.total += Number(row.total_price) || 0
    m.set(key, e)
  }
  return m
}

// ── ML snapshot fetch ────────────────────────────────────────────────────────

async function fetchAndStoreSnapshot(supabase: any, source_type: "categoria" | "vendedor", source_id: string) {
  try {
    const { data: acc } = await supabase
      .from("ml_accounts")
      .select("id")
      .eq("is_active", true)
      .gt("token_expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle()

    if (!acc?.id) return

    const token = await getValidAccessToken(acc.id)

    const param =
      source_type === "categoria"
        ? `category=${encodeURIComponent(source_id)}`
        : `seller_id=${encodeURIComponent(source_id)}`

    const url = `https://api.mercadolibre.com/sites/MLA/search?${param}&sort=sold_quantity_desc&limit=${ML_SEARCH_LIMIT}`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return

    const data = await res.json()
    const today = isoDate(new Date())

    const rows = (data.results ?? []).map((item: any) => ({
      snapshot_date: today,
      source_type,
      source_id,
      ml_item_id: item.id,
      title: item.title,
      author: null,
      isbn: null,
      thumbnail: item.thumbnail,
      sold_quantity: item.sold_quantity ?? 0,
      price: item.price,
      permalink: item.permalink,
    }))

    if (rows.length > 0) {
      await supabase
        .from("radar_sales_snapshots")
        .upsert(rows, { onConflict: "snapshot_date,source_type,source_id,ml_item_id" })
    }
  } catch (e) {
    console.error("[RADAR-SNAP]", source_type, source_id, e)
  }
}

// ── sources ──────────────────────────────────────────────────────────────────

async function getPropiasTrends(supabase: any, days: number, limit: number, account_id: string | null) {
  const { now, curStart, prevStart } = periodDates(days)

  const base = (start: Date, end: Date) =>
    supabase
      .from("orders")
      .select("id")
      .gte("order_date", start.toISOString())
      .lt("order_date", end.toISOString())
      .in("payment_status", ["paid", "completed"])

  // Por cuenta si se especificó
  const addAccount = (q: any) => (account_id ? q.eq("account_id", account_id) : q)

  const [{ data: curOrders }, { data: prevOrders }] = await Promise.all([
    addAccount(base(curStart, now)),
    addAccount(base(prevStart, curStart)),
  ])

  const curIds = (curOrders ?? []).map((o: any) => o.id)
  const prevIds = (prevOrders ?? []).map((o: any) => o.id)

  const [curItemsRes, prevItemsRes] = await Promise.all([
    curIds.length
      ? supabase.from("order_items").select("title,sku,quantity,total_price").in("order_id", curIds)
      : { data: [] },
    prevIds.length
      ? supabase.from("order_items").select("title,sku,quantity,total_price").in("order_id", prevIds)
      : { data: [] },
  ])

  const curMap = aggregateItems(curItemsRes.data ?? [])
  const prevMap = aggregateItems(prevItemsRes.data ?? [])

  const trending: any[] = []

  for (const [key, cur] of curMap) {
    const prev = prevMap.get(key)
    const pQty = prev?.qty ?? 0
    const delta = cur.qty - pQty
    if (cur.qty > 0) {
      trending.push({
        title: cur.title,
        sku: cur.sku,
        current_qty: cur.qty,
        prev_qty: pQty,
        delta,
        pct_change: pQty > 0 ? Math.round((delta / pQty) * 100) : null,
        is_new: pQty === 0,
      })
    }
  }

  // Items que cayeron a 0 en período actual (de bajada)
  for (const [key, prev] of prevMap) {
    if (!curMap.has(key) && prev.qty > 0) {
      trending.push({
        title: prev.title,
        sku: prev.sku,
        current_qty: 0,
        prev_qty: prev.qty,
        delta: -prev.qty,
        pct_change: -100,
        is_new: false,
      })
    }
  }

  trending.sort((a, b) => b.delta - a.delta)

  return NextResponse.json({
    ok: true,
    source: "propias",
    days,
    account_id: account_id ?? null,
    total: trending.length,
    items: trending.slice(0, limit),
  })
}

async function getCategoryTrends(supabase: any, days: number, limit: number, category_id: string) {
  const today = isoDate(new Date())
  const cutoff = isoDate(new Date(Date.now() - days * 86_400_000))

  // Snapshot de hoy si no existe
  const { data: hasToday } = await supabase
    .from("radar_sales_snapshots")
    .select("id")
    .eq("source_type", "categoria")
    .eq("source_id", category_id)
    .eq("snapshot_date", today)
    .limit(1)
    .maybeSingle()

  if (!hasToday) {
    await fetchAndStoreSnapshot(supabase, "categoria", category_id)
  }

  const [{ data: latest }, { data: previous }] = await Promise.all([
    supabase
      .from("radar_sales_snapshots")
      .select("ml_item_id,title,thumbnail,price,permalink,sold_quantity")
      .eq("source_type", "categoria")
      .eq("source_id", category_id)
      .eq("snapshot_date", today)
      .order("sold_quantity", { ascending: false })
      .limit(100),

    supabase
      .from("radar_sales_snapshots")
      .select("ml_item_id,sold_quantity")
      .eq("source_type", "categoria")
      .eq("source_id", category_id)
      .lte("snapshot_date", cutoff)
      .order("snapshot_date", { ascending: false })
      .limit(200),
  ])

  // Tomar el snapshot más antiguo disponible en el período para cada item
  const prevMap = new Map<string, number>()
  for (const p of previous ?? []) {
    if (!prevMap.has(p.ml_item_id)) prevMap.set(p.ml_item_id, Number(p.sold_quantity))
  }

  const hasHistory = (previous ?? []).length > 0

  const items = (latest ?? [])
    .map((item: any) => {
      const cur = Number(item.sold_quantity)
      const prev = prevMap.get(item.ml_item_id) ?? null
      const delta = prev !== null ? cur - prev : null
      return {
        ml_item_id: item.ml_item_id,
        title: item.title,
        thumbnail: item.thumbnail,
        price: item.price,
        permalink: item.permalink,
        current_qty: cur,
        prev_qty: prev,
        delta,
        pct_change: prev && prev > 0 ? Math.round((delta! / prev) * 100) : null,
        has_trend: prev !== null,
      }
    })
    .sort((a: any, b: any) => (b.delta ?? b.current_qty) - (a.delta ?? a.current_qty))

  return NextResponse.json({
    ok: true,
    source: "categoria",
    category_id,
    days,
    has_history: hasHistory,
    total: items.length,
    items: items.slice(0, limit),
  })
}

async function getVendedoresTrends(supabase: any, days: number, limit: number) {
  const { data: sellers } = await supabase
    .from("radar_watched_sellers")
    .select("seller_id, nickname")
    .eq("enabled", true)

  if (!sellers?.length) {
    return NextResponse.json({ ok: true, source: "vendedores", no_sellers: true, items: [] })
  }

  const today = isoDate(new Date())
  const cutoff = isoDate(new Date(Date.now() - days * 86_400_000))

  // Fetch snapshots of today for all sellers in parallel
  await Promise.all(
    sellers.map(async (s: any) => {
      const { data: has } = await supabase
        .from("radar_sales_snapshots")
        .select("id")
        .eq("source_type", "vendedor")
        .eq("source_id", s.seller_id)
        .eq("snapshot_date", today)
        .limit(1)
        .maybeSingle()
      if (!has) await fetchAndStoreSnapshot(supabase, "vendedor", s.seller_id)
    }),
  )

  const sellerIds = sellers.map((s: any) => s.seller_id)
  const nicknameMap = new Map(sellers.map((s: any) => [s.seller_id, s.nickname]))

  const [{ data: latest }, { data: previous }] = await Promise.all([
    supabase
      .from("radar_sales_snapshots")
      .select("ml_item_id,source_id,title,thumbnail,price,permalink,sold_quantity")
      .eq("source_type", "vendedor")
      .in("source_id", sellerIds)
      .eq("snapshot_date", today)
      .order("sold_quantity", { ascending: false })
      .limit(200),

    supabase
      .from("radar_sales_snapshots")
      .select("ml_item_id,source_id,sold_quantity")
      .eq("source_type", "vendedor")
      .in("source_id", sellerIds)
      .lte("snapshot_date", cutoff)
      .order("snapshot_date", { ascending: false })
      .limit(500),
  ])

  const prevMap = new Map<string, number>()
  for (const p of previous ?? []) {
    const key = `${p.source_id}:${p.ml_item_id}`
    if (!prevMap.has(key)) prevMap.set(key, Number(p.sold_quantity))
  }

  const hasHistory = (previous ?? []).length > 0

  const items = (latest ?? [])
    .map((item: any) => {
      const key = `${item.source_id}:${item.ml_item_id}`
      const cur = Number(item.sold_quantity)
      const prev = prevMap.get(key) ?? null
      const delta = prev !== null ? cur - prev : null
      return {
        ml_item_id: item.ml_item_id,
        title: item.title,
        thumbnail: item.thumbnail,
        price: item.price,
        permalink: item.permalink,
        seller_id: item.source_id,
        seller_name: nicknameMap.get(item.source_id) ?? item.source_id,
        current_qty: cur,
        prev_qty: prev,
        delta,
        pct_change: prev && prev > 0 ? Math.round((delta! / prev) * 100) : null,
        has_trend: prev !== null,
      }
    })
    .sort((a: any, b: any) => (b.delta ?? b.current_qty) - (a.delta ?? a.current_qty))

  return NextResponse.json({
    ok: true,
    source: "vendedores",
    days,
    has_history: hasHistory,
    sellers: sellers.map((s: any) => ({ seller_id: s.seller_id, nickname: s.nickname })),
    total: items.length,
    items: items.slice(0, limit),
  })
}

// ── main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const source = sp.get("source") || "propias"
    const days = Math.min(90, Math.max(1, Number(sp.get("days") || "7")))
    const limit = Math.min(50, Math.max(1, Number(sp.get("limit") || "20")))
    const account_id = sp.get("account_id") || null
    const category_id = sp.get("category_id") || DEFAULT_CATEGORY

    const supabase = await createClient()

    switch (source) {
      case "propias":
        return getPropiasTrends(supabase, days, limit, account_id)
      case "categoria":
        return getCategoryTrends(supabase, days, limit, category_id)
      case "vendedores":
        return getVendedoresTrends(supabase, days, limit)
      default:
        return NextResponse.json({ ok: false, error: "source inválido" }, { status: 400 })
    }
  } catch (e: any) {
    console.error("[RADAR-VENTAS]", e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
