/**
 * Arnoia Stock adapter for the import pipeline.
 * Downloads CSV, maps columns, runs through staging → merge → zero → refresh.
 */

import { createAdminClient } from "@/lib/db/admin"
import { runImportPipeline, type PipelineResult } from "@/lib/import/pipeline"
import { fetchAndParseCsv } from "@/lib/import/csv-fetch"

export async function runArnoiaStockPipeline(sourceId?: string): Promise<PipelineResult> {
  const admin = createAdminClient()

  // Find source by ID or by name
  let source: any = null
  if (sourceId) {
    const { data } = await admin
      .from("import_sources")
      .select("id, name, source_key, url_template, auth_type, credentials, delimiter, column_mapping")
      .eq("id", sourceId)
      .single()
    source = data
  } else {
    const { data } = await admin
      .from("import_sources")
      .select("id, name, source_key, url_template, auth_type, credentials, delimiter, column_mapping")
      .eq("name", "Arnoia Stock")
      .eq("is_active", true)
      .maybeSingle()
    source = data
  }

  if (!source) {
    return { success: false, run_id: "", phases: {} as any, total_duration_ms: 0, error: "Arnoia stock source not found" }
  }

  const cm = source.column_mapping ?? {}

  return runImportPipeline({
    sourceId: source.id,
    sourceName: source.name,
    sourceKey: source.source_key ?? "arnoia",
    mode: "stock_only",
    minRowsForZero: 100,
    fetchRows: () => fetchAndParseCsv({
      url: source.url_template,
      authType: source.auth_type,
      credentials: source.credentials,
      delimiter: source.delimiter,
    }),
    mapRow: (row) => ({
      ean: row[cm.ean ?? "ean"] ?? row["EAN"] ?? null,
      sku: row[cm.sku ?? "sku"] ?? null,
      title: row[cm.title ?? "titulo"] ?? row["ARTICULO"] ?? null,
      stock: parseIntSafe(row[cm.stock ?? "stock"] ?? row["STOCK"]),
      price: parseFloatSafe(row[cm.price ?? "precio_sin_iva"] ?? row["PRECIO"]),
      price_ars: null,
    }),
  })
}

function parseIntSafe(v: string | undefined): number | null {
  if (!v) return null
  const n = parseInt(v.replace(/\D/g, ""), 10)
  return isNaN(n) ? null : n
}

function parseFloatSafe(v: string | undefined): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(",", ".").replace(/[^\d.]/g, ""))
  return isNaN(n) ? null : n
}
