import { type NextRequest, NextResponse } from "next/server"
import { runCatalogImport } from "@/lib/azeta/run-catalog-import"

export const maxDuration = 300

/**
 * Preferir región Europa (Frankfurt) — el servidor de Azeta está en España.
 * Desde Frankfurt la descarga de 230MB es ~4× más rápida que desde EEUU.
 */
export const preferredRegion = "fra1"

/**
 * GET/POST /api/azeta/import-catalog
 *
 * Importación de catálogo AZETA (Total o Parcial).
 *
 * Modos de respuesta:
 *   - Sin header Accept: text/event-stream → responde JSON (cron, llamadas server-side)
 *   - Con Accept: text/event-stream → responde SSE con eventos de progreso en tiempo real
 *
 * Body: { source_id?, source_name? }
 */

export async function GET(request: NextRequest) {
  return POST(request)
}

export async function POST(request: NextRequest) {
  let source_id: string | undefined
  let source_name: string | undefined

  try {
    const body = await request.json().catch(() => ({}))
    source_id   = body.source_id   || undefined
    source_name = body.source_name || undefined
  } catch {}

  const wantsSSE = request.headers.get("accept")?.includes("text/event-stream")

  if (!wantsSSE) {
    // Modo cron / server-side: respuesta JSON simple
    try {
      const result = await runCatalogImport(
        source_id   ? { source_id }   :
        source_name ? { source_name } :
        undefined
      )
      return NextResponse.json(result, { status: result.success ? 200 : 500 })
    } catch (err: any) {
      console.error("[import-catalog] Unhandled error:", err)
      return NextResponse.json(
        { success: false, error: err?.message ?? "Error interno del servidor" },
        { status: 500 }
      )
    }
  }

  // ── Modo SSE: streaming de progreso en tiempo real ─────────────────────────
  // Cada lote procesado emite un evento SSE → el cliente muestra progreso live.
  // Si Vercel mata la función a los 300s, los batches ya persistidos se conservan.
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // controller ya cerrado (cliente desconectó)
        }
      }

      try {
        send({ type: "start", message: "Iniciando importación Azeta..." })

        const result = await runCatalogImport(
          source_id   ? { source_id }   :
          source_name ? { source_name } :
          undefined,
          // Callback de progreso: llamado después de cada batch flush
          (progress) => send({ type: "progress", ...progress })
        )

        send({ type: "done", ...result })
      } catch (err: any) {
        console.error("[import-catalog][SSE] Error:", err.message)
        send({ type: "error", error: err.message })
      } finally {
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no", // desactivar buffering en Nginx/proxies
    },
  })
}
