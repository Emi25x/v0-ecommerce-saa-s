import { type NextRequest, NextResponse } from "next/server"
import { put, del, list } from "@vercel/blob"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// URL de fallback (Azeta Total) — solo si no está configurado en import_sources
const AZETA_TOTAL_URL = "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Connection": "keep-alive",
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "azeta-download-v4" })
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

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
      console.warn(`[AZETA-DL] source_id=${source_id} no encontrado, usando fallback`)
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
    console.log(`[AZETA-DL] Iniciando fetch desde ${url}`)
    const res = await fetch(url, { headers: FETCH_HEADERS })
    console.log(`[AZETA-DL] status=${res.status} content-length=${res.headers.get("content-length")}`)

    if (!res.ok) {
      const preview = await res.text().then(t => t.slice(0, 200)).catch(() => "")
      return NextResponse.json({ error: `Error ${res.status} AZETA`, preview }, { status: 502 })
    }
    if (!res.body) throw new Error("Azeta response body is null")

    // Limpiar blobs anteriores
    try {
      const { blobs } = await list({ prefix: "azeta-catalog/" })
      await Promise.all(blobs.map(b => del(b.url)))
    } catch {}

    // Peek primer chunk para detectar ZIP vs CSV
    const reader = res.body.getReader()
    const { value: firstChunk } = await reader.read()
    if (!firstChunk || firstChunk.length < 2) throw new Error("Respuesta vacía de Azeta")

    const previewText = new TextDecoder("utf8").decode(firstChunk.slice(0, 200))
    if (previewText.toLowerCase().includes("<html") || previewText.toLowerCase().includes("<!doctype")) {
      return NextResponse.json({
        error: `Servidor AZETA devolvió HTML. Posible error de credenciales. Preview: ${previewText.slice(0, 150)}`,
      }, { status: 502 })
    }

    const isZip = firstChunk[0] === 0x50 && firstChunk[1] === 0x4b
    console.log(`[AZETA-DL] Formato: ${isZip ? "ZIP (fflate streaming)" : "CSV plano"}`)

    let csvBlobResult: { url: string }

    if (isZip) {
      // ── ZIP: stream Azeta → fflate Unzip → Vercel Blob (sin cargar el archivo completo en RAM) ──
      const { Unzip, UnzipInflate } = await import("fflate")

      // Crear un ReadableStream que recibirá los chunks descomprimidos del CSV
      let csvController!: ReadableStreamDefaultController<Uint8Array>
      const csvReadable = new ReadableStream<Uint8Array>({
        start(controller) { csvController = controller },
      })

      const unzipper = new Unzip()
      unzipper.register(UnzipInflate)
      let fileFound = false

      unzipper.onfile = (file) => {
        if (!fileFound && !file.name.endsWith("/")) {
          fileFound = true
          console.log(`[AZETA-DL] ZIP entry: "${file.name}"`)
          file.ondata = (err, data, final) => {
            if (err) { csvController.error(err); return }
            csvController.enqueue(data)
            if (final) csvController.close()
          }
          file.start()
        } else {
          file.terminate()
        }
      }

      // Función que alimenta el unzipper con los chunks del stream de Azeta
      async function pumpZip() {
        try {
          unzipper.push(firstChunk!, false)
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              // Señalizar fin del ZIP al unzipper
              unzipper.push(value && value.length > 0 ? value : new Uint8Array(0), true)
              break
            }
            if (value) unzipper.push(value, false)
          }
          if (!fileFound) csvController.error(new Error("No se encontró CSV/TXT en el ZIP de Azeta"))
        } catch (e) {
          csvController.error(e)
        }
      }

      // Subir CSV a Vercel Blob mientras se descomprime (pipeline concurrente, sin buffering)
      const [blobResult] = await Promise.all([
        put("azeta-catalog/catalog.csv", csvReadable, {
          access: "public",
          contentType: "text/plain; charset=utf-8",
        }),
        pumpZip(),
      ])
      csvBlobResult = blobResult

    } else {
      // ── CSV plano: stream directo a Vercel Blob ──
      const csvStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(firstChunk!)
          ;(async () => {
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) { controller.close(); break }
                if (value) controller.enqueue(value)
              }
            } catch (e) { controller.error(e) }
          })()
        },
      })
      csvBlobResult = await put("azeta-catalog/catalog.csv", csvStream, {
        access: "public",
        contentType: "text/plain; charset=utf-8",
      })
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA-DL] CSV en Blob: ${csvBlobResult.url} en ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      blob_url: csvBlobResult.url,
      elapsed_seconds: parseFloat(elapsed),
      // total_lines no disponible en modo streaming (se calcula en process)
      total_lines: null,
    })

  } catch (err: any) {
    const msg = err?.message || String(err) || "Unknown error"
    console.error("[AZETA-DL] Error:", err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
