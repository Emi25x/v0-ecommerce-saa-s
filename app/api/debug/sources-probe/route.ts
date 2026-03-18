/**
 * GET /api/debug/sources-probe
 *
 * Descarga las primeras líneas de cada fuente activa y analiza el formato:
 * delimitador, encoding, headers, columnas. Útil para verificar que el
 * importer está configurado correctamente sin hacer un import completo.
 *
 * Query params:
 *   source_id  — UUID de una fuente específica (opcional; sin él prueba todas)
 *   rows       — cuántas filas mostrar (default 5)
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const sourceId = searchParams.get("source_id")
  const maxRows = Math.min(parseInt(searchParams.get("rows") ?? "5"), 20)

  let q = supabase
    .from("import_sources")
    .select("id, name, feed_type, url_template, delimiter, column_mapping, source_key, credentials")
    .eq("is_active", true)
    .order("name")

  if (sourceId) q = q.eq("id", sourceId)

  const { data: sources, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = []

  for (const src of sources ?? []) {
    const result: any = {
      id: src.id,
      name: src.name,
      feed_type: src.feed_type,
      source_key: src.source_key,
      url: src.url_template,
      column_mapping: src.column_mapping,
    }

    if (src.feed_type === "api") {
      result.note = "API JSON — no se descarga CSV. Ver lib/libral/run-stock-import.ts"
      results.push(result)
      continue
    }

    if (!src.url_template) {
      result.error = "Sin url_template configurado"
      results.push(result)
      continue
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const res = await fetch(src.url_template, {
        headers: { "User-Agent": "Mozilla/5.0 compatible" },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      result.http_status = res.status
      result.content_type = res.headers.get("content-type") ?? "unknown"

      if (!res.ok) {
        result.error = `HTTP ${res.status}`
        results.push(result)
        continue
      }

      // Detectar si es ZIP
      const contentType = result.content_type.toLowerCase()
      const isZip = contentType.includes("zip") || src.url_template.endsWith(".zip")
      if (isZip) {
        result.note = "Archivo ZIP — no se puede inspeccionar inline. Verificar manualmente."
        result.size_bytes = res.headers.get("content-length")
        results.push(result)
        continue
      }

      // Leer primeros 8KB para detectar formato
      const buffer = Buffer.from(await res.arrayBuffer())
      const sizeBytes = buffer.length
      result.size_bytes = sizeBytes

      // Intentar latin1 y utf8, quedarse con el que tenga menos caracteres raros
      const textUtf8 = buffer.toString("utf8")
      const textLatin1 = buffer.toString("latin1")
      const weirdUtf8 = (textUtf8.match(/\uFFFD/g) || []).length
      const encoding = weirdUtf8 > 5 ? "latin1" : "utf-8"
      const text = encoding === "latin1" ? textLatin1 : textUtf8
      result.encoding_detected = encoding

      const lines = text.split("\n").filter(l => l.trim()).slice(0, maxRows + 2)
      if (lines.length === 0) {
        result.error = "Archivo vacío"
        results.push(result)
        continue
      }

      // Detectar delimitador
      const firstLine = lines[0]
      const counts: Record<string, number> = {
        "|": (firstLine.match(/\|/g) || []).length,
        ";": (firstLine.match(/;/g) || []).length,
        "\t": (firstLine.match(/\t/g) || []).length,
        ",": (firstLine.match(/,/g) || []).length,
      }
      const detectedDelimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
      result.delimiter_detected = detectedDelimiter === "\t" ? "TAB" : detectedDelimiter
      result.delimiter_counts = {
        pipe: counts["|"],
        semicolon: counts[";"],
        tab: counts["\t"],
        comma: counts[","],
      }

      // Detectar si tiene headers (primera columna numérica = sin header)
      const firstCol = firstLine.split(detectedDelimiter)[0].replace(/['"]/g, "").trim()
      const hasHeader = !/^\d{8,13}$/.test(firstCol) // si es EAN (8-13 dígitos) = sin header
      result.has_header = hasHeader

      // Parsear headers o columnas
      const sep = detectedDelimiter
      if (hasHeader) {
        result.headers = firstLine.split(sep).map(h => h.replace(/['"]/g, "").trim())
        result.column_count = result.headers.length
      } else {
        result.note_no_header = "Sin encabezado — col0=EAN, col1=stock (u otros según importer)"
        result.sample_first_col = firstLine.split(sep)[0].trim()
        result.column_count = firstLine.split(sep).length
      }

      // Primeras filas de datos
      const dataStart = hasHeader ? 1 : 0
      result.sample_rows = lines.slice(dataStart, dataStart + maxRows).map(line => {
        const cols = line.split(sep).map(v => v.replace(/['"]/g, "").trim())
        if (hasHeader && result.headers) {
          const obj: Record<string, string> = {}
          result.headers.forEach((h: string, i: number) => { obj[h] = cols[i] ?? "" })
          return obj
        }
        return cols
      })

      // Verificar column_mapping contra headers detectados
      if (hasHeader && src.column_mapping && result.headers) {
        const mapping = src.column_mapping as Record<string, string>
        // Keys that are config directives, not CSV column names
        const CONFIG_ONLY_KEYS = new Set(["match_field", "delimiter", "mappings"])
        const mappingCheck: Record<string, "OK" | "MISSING"> = {}
        for (const [field, csvCol] of Object.entries(mapping)) {
          if (typeof csvCol !== "string") continue
          if (CONFIG_ONLY_KEYS.has(field)) continue // skip non-column config keys
          mappingCheck[field] = result.headers.includes(csvCol) ? "OK" : "MISSING"
        }
        result.column_mapping_check = mappingCheck
        const missing = Object.entries(mappingCheck).filter(([, v]) => v === "MISSING").map(([k]) => k)
        result.mapping_issues = missing.length > 0 ? missing : null
      }

    } catch (e: any) {
      result.error = e.name === "AbortError" ? "Timeout (>15s)" : e.message
    }

    results.push(result)
  }

  return NextResponse.json({ probed_at: new Date().toISOString(), sources: results }, { status: 200 })
}
