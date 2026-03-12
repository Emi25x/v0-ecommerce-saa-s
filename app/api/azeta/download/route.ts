import { type NextRequest, NextResponse } from "next/server"
import { put, del, list } from "@vercel/blob"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// URL de fallback (Azeta Total) — solo si no está configurado en import_sources
const AZETA_TOTAL_URL = "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"

export async function GET() {
  return NextResponse.json({ ok: true, route: "azeta-download-v3" })
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Leer source_id del body (opcional — si no viene, usa Azeta Total)
  const body = await request.json().catch(() => ({}))
  const source_id: string | null = body.source_id || null

  // Resolver URL desde import_sources
  const supabase = createAdminClient()
  let url = AZETA_TOTAL_URL

  if (source_id) {
    const { data: src } = await supabase
      .from("import_sources")
      .select("url_template, name")
      .eq("id", source_id)
      .maybeSingle()
    if (src?.url_template) {
      url = src.url_template
      console.log(`[AZETA-DL] Fuente: "${src.name}" → ${url}`)
    } else {
      console.warn(`[AZETA-DL] source_id=${source_id} no encontrado en import_sources, usando fallback`)
    }
  } else {
    const { data: src } = await supabase
      .from("import_sources")
      .select("url_template, name")
      .ilike("name", "azeta%total%")
      .maybeSingle()
    if (src?.url_template) {
      url = src.url_template
      console.log(`[AZETA-DL] Fuente (auto): "${src.name}" → ${url}`)
    }
  }

  try {
    // 1. Fetch desde AZETA — streaming directo a Blob sin bufferear en memoria
    console.log(`[AZETA-DL] Iniciando stream → Blob desde ${url}`)
    const res = await fetch(url)
    console.log(`[AZETA-DL] status=${res.status} content-length=${res.headers.get("content-length")}`)
    if (!res.ok) {
      const preview = await res.text().then(t => t.slice(0, 200)).catch(() => "")
      return NextResponse.json({ error: `Error ${res.status} AZETA`, preview }, { status: 502 })
    }

    // 2. Borrar blobs anteriores
    try {
      const { blobs } = await list({ prefix: "azeta-catalog/" })
      await Promise.all(blobs.map(b => del(b.url)))
    } catch {}

    // 3. Stream directo del body al put() de Blob (sin buffering local)
    if (!res.body) throw new Error("Azeta response body is null (empty response from server)")
    const rawBlob = await put("azeta-catalog/catalog.raw", res.body, {
      access: "public",
      contentType: "application/octet-stream",
    })
    const elapsed1 = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA-DL] Subido a Blob en ${elapsed1}s: ${rawBlob.url}`)

    // 4. Descargar el contenido desde Blob para detectar formato y extraer CSV
    const rawRes = await fetch(rawBlob.url)
    const rawBuf = Buffer.from(await rawRes.arrayBuffer())
    console.log(`[AZETA-DL] Descargado desde Blob: ${(rawBuf.length / 1024 / 1024).toFixed(1)}MB`)

    // 5. Detectar ZIP vs CSV plano (magic bytes PK)
    const isZip = rawBuf[0] === 0x50 && rawBuf[1] === 0x4b
    console.log(`[AZETA-DL] Formato detectado: ${isZip ? "ZIP" : "CSV plano"}`)

    let csvText: string
    if (isZip) {
      csvText = await extractCSVFromZip(new Uint8Array(rawBuf))
    } else {
      // CSV plano (ej: Azeta Parcial) — decodificar latin1 directamente
      csvText = new TextDecoder("latin1").decode(rawBuf)
    }

    const lines = csvText.split("\n")
    const totalLines = Math.max(0, lines.filter(l => l.trim()).length - 1) // sin header

    // Si no hay datos (solo header o vacío), limpiar y salir sin crear CSV blob
    if (totalLines === 0) {
      await del(rawBlob.url).catch(() => {})
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      const rawSizeMb = (rawBuf.length / 1024 / 1024).toFixed(2)
      const rawPreview = csvText.slice(0, 400).replace(/\r/g, "").trim()
      console.warn(`[AZETA-DL] Catálogo vacío (0 filas). rawSize=${rawSizeMb}MB isZip=${isZip} preview="${rawPreview.slice(0, 100)}"`)
      const isHtml = rawPreview.toLowerCase().includes("<html") || rawPreview.toLowerCase().includes("<!doctype")
      return NextResponse.json({
        ok: true,
        empty: true,
        blob_url: null,
        csv_size_mb: 0,
        total_lines: 0,
        elapsed_seconds: parseFloat(elapsed),
        raw_size_mb: parseFloat(rawSizeMb),
        raw_preview: rawPreview,
        is_zip: isZip,
        message: rawBuf.length === 0
          ? "El servidor de Azeta devolvió una respuesta vacía (0 bytes)."
          : isHtml
            ? "El servidor de Azeta devolvió HTML en lugar del catálogo (posible error de credenciales o sesión caducada)."
            : "El catálogo solo tiene encabezado sin filas de datos.",
      })
    }

    // 6. Subir CSV descomprimido a Blob (para que process pueda usar Range)
    const csvBlobResult = await put("azeta-catalog/catalog.csv", csvText, {
      access: "public",
      contentType: "text/plain; charset=utf-8",
    })
    // Borrar raw blob
    await del(rawBlob.url).catch(() => {})

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA-DL] CSV en Blob: ${csvBlobResult.url} lineas=${totalLines} en ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      blob_url: csvBlobResult.url,
      csv_size_mb: parseFloat((csvText.length / 1024 / 1024).toFixed(1)),
      total_lines: totalLines,
      elapsed_seconds: parseFloat(elapsed),
    })
  } catch (err: any) {
    const msg = err?.message || String(err) || "Unknown error"
    console.error("[AZETA-DL] Error:", err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Extrae el primer CSV/TXT de un ZIP usando adm-zip (soporta streaming ZIPs con compressedSize=0)
async function extractCSVFromZip(buf: Uint8Array): Promise<string> {
  const AdmZip = (await import("adm-zip")).default
  const zip = new AdmZip(Buffer.from(buf))
  const entries = zip.getEntries()
  for (const entry of entries) {
    console.log(`[ZIP] entry="${entry.entryName}" size=${(entry.header.size / 1024 / 1024).toFixed(1)}MB`)
    if (/\.(csv|txt)$/i.test(entry.entryName) && !entry.isDirectory) {
      const decompressed = entry.getData()
      return new TextDecoder("latin1").decode(decompressed)
    }
  }
  throw new Error("No se encontro CSV/TXT en el ZIP")
}
