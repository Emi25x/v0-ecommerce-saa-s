/**
 * @deprecated /api/azeta/upload-csv
 *
 * Sube un CSV a Vercel Blob pero no lo procesa. Flujo incompleto.
 * NO usar — la descarga y procesamiento están unificados en:
 *   POST /api/azeta/download  → descarga ZIP/CSV y lo sube a Blob
 *   POST /api/azeta/process   → procesa desde Blob en chunks
 */

import { NextRequest, NextResponse } from "next/server"
import { put, del, list } from "@vercel/blob"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ ok: true, route: "azeta-upload-csv-v1", deprecated: true })
}

export async function POST(request: NextRequest) {
  console.warn(
    "[DEPRECATED] POST /api/azeta/upload-csv — " +
    "usar POST /api/azeta/download (descarga+blob) + POST /api/azeta/process (procesamiento)"
  )
  try {
    // Borrar blobs anteriores
    try {
      const { blobs } = await list({ prefix: "azeta-catalog/" })
      await Promise.all(blobs.map(b => del(b.url)))
    } catch {}

    // El body es el CSV como texto plano (latin1 codificado como utf8 desde el browser)
    const csvText = await request.text()
    const totalLines = csvText.split("\n").length - 1

    const csvBlob = new Blob([csvText], { type: "text/plain; charset=utf-8" })
    const blob = await put("azeta-catalog/catalog.csv", csvBlob, { access: "public" })

    return NextResponse.json({
      ok: true,
      blob_url: blob.url,
      csv_size_mb: parseFloat((csvText.length / 1024 / 1024).toFixed(1)),
      total_lines: totalLines,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
