/**
 * POST /api/import/pipeline
 *
 * Multi-step import pipeline.
 *
 * Actions:
 *   { action: "start", adapter: "arnoia_stock" }  → Download + Stage + Validate
 *   { action: "start", source_id: "uuid" }         → Same, resolved from source
 *   { action: "tick" }                              → Continue merging next batch
 *   { action: "status" }                            → Get current pipeline status
 *
 * For backward compat: { adapter: "arnoia_stock" } without action does full start.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { tickPipeline, getPipelineStatus } from "@/lib/import/pipeline-worker"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isCron = request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`

  if (!user && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const action = body.action ?? "start"

    // ── Status check ──────────────────────────────────────────────────────
    if (action === "status") {
      const status = await getPipelineStatus()
      return NextResponse.json({ pipelines: status })
    }

    // ── Tick: continue merging ─────────────────────────────────────────────
    if (action === "tick") {
      const result = await tickPipeline()
      return NextResponse.json(result)
    }

    // ── Start: download + stage + validate ─────────────────────────────────
    const { adapter, source_id } = body

    // Resolve source config
    const { createAdminClient } = await import("@/lib/db/admin")
    const admin = createAdminClient()
    let source: any = null

    if (source_id) {
      const { data } = await admin
        .from("import_sources")
        .select("id, name, source_key, url_template, auth_type, credentials, delimiter, column_mapping, feed_type")
        .eq("id", source_id)
        .single()
      source = data
    } else if (adapter === "arnoia_stock") {
      const { data } = await admin
        .from("import_sources")
        .select("id, name, source_key, url_template, auth_type, credentials, delimiter, column_mapping, feed_type")
        .eq("name", "Arnoia Stock")
        .eq("is_active", true)
        .maybeSingle()
      source = data
    } else if (adapter === "libral_stock") {
      const { data } = await admin
        .from("import_sources")
        .select("id, name, source_key, url_template, auth_type, credentials, delimiter, column_mapping, feed_type")
        .eq("source_key", "libral_argentina")
        .eq("is_active", true)
        .maybeSingle()
      source = data
    }

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 })
    }

    const cm = source.column_mapping ?? {}
    const { fetchAndParseCsv } = await import("@/lib/import/csv-fetch")
    const { startPipeline } = await import("@/lib/import/pipeline-worker")

    const result = await startPipeline({
      sourceId: source.id,
      sourceName: source.name,
      sourceKey: source.source_key ?? source.name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      mode: source.feed_type === "stock_price" ? "stock_only" : "catalog",
      fetchRows: () => fetchAndParseCsv({
        url: source.url_template,
        authType: source.auth_type,
        credentials: source.credentials,
        delimiter: source.delimiter,
      }),
      mapRow: (row: Record<string, string>) => ({
        ean: row[cm.ean ?? "EAN"] ?? row["ean"] ?? null,
        sku: row[cm.sku ?? "SKU"] ?? row["sku"] ?? null,
        title: row[cm.title ?? "ARTICULO"] ?? row["titulo"] ?? null,
        stock: parseNum(row[cm.stock ?? "STOCK"] ?? row["stock"]),
        price: parseFloat2(row[cm.price ?? "PRECIO_EUROS"] ?? row["precio_sin_iva"] ?? row["precio"]),
        price_ars: parseFloat2(row[cm.price_ars ?? "PESOS_ARGENTINOS"]),
      }),
    })

    // If start was successful and we have time left, do first merge tick
    if (result.action === "started" && result.duration_ms && result.duration_ms < 60000) {
      const tickResult = await tickPipeline()
      return NextResponse.json({
        start: result,
        tick: tickResult,
        next: tickResult.action === "merging" ? "Call POST with { action: 'tick' } to continue" : "Done",
      })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  // Cron tick — just continue merging
  const isCron = request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await tickPipeline()
  return NextResponse.json(result)
}

function parseNum(v: string | undefined): number | null {
  if (!v) return null
  const n = parseInt(v.replace(/\D/g, ""), 10)
  return isNaN(n) ? null : n
}

function parseFloat2(v: string | undefined): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(",", ".").replace(/[^\d.]/g, ""))
  return isNaN(n) ? null : n
}
