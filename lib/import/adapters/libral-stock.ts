/**
 * Libral Argentina Stock adapter for the import pipeline.
 * Downloads TXT (tab-separated), maps columns, runs pipeline.
 */

import { createAdminClient } from "@/lib/db/admin"
import { runImportPipeline, type PipelineResult } from "@/lib/import/pipeline"
import { fetchAndParseCsv } from "@/lib/import/csv-fetch"

export async function runLibralStockPipeline(sourceId?: string): Promise<PipelineResult> {
  const admin = createAdminClient()

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
      .eq("source_key", "libral_argentina")
      .eq("is_active", true)
      .maybeSingle()
    source = data
  }

  if (!source) {
    return { success: false, run_id: "", phases: {} as any, total_duration_ms: 0, error: "Libral Argentina source not found" }
  }

  const cm = source.column_mapping ?? {}

  return runImportPipeline({
    sourceId: source.id,
    sourceName: source.name,
    sourceKey: source.source_key ?? "libral_argentina",
    mode: "stock_only",
    minRowsForZero: 10,
    fetchRows: () => fetchAndParseCsv({
      url: source.url_template,
      authType: source.auth_type,
      credentials: source.credentials,
      delimiter: source.delimiter ?? "\t",
    }),
    mapRow: (row) => ({
      ean: row[cm.ean ?? "EAN"] ?? null,
      sku: null,
      title: row[cm.title ?? "ARTICULO"] ?? null,
      stock: parseIntSafe(row[cm.stock ?? "STOCK"]),
      price: parseFloatSafe(row[cm.price ?? "PRECIO_EUROS"]),
      price_ars: parseFloatSafe(row[cm.price_ars ?? "PESOS_ARGENTINOS"]),
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
