import { type NextRequest, NextResponse } from "next/server"
import { runCatalogImport } from "@/lib/azeta/run-catalog-import"

export const maxDuration = 300

/**
 * GET/POST /api/azeta/import-catalog
 *
 * Importación de catálogo AZETA (Total o Parcial).
 * Acepta source_id o source_name en el body para seleccionar la fuente correcta.
 * Invocado por Vercel Cron cada domingo a las 3:00 AM (sin body → usa "Azeta Total").
 * También invocado desde la UI de batch-import para importación manual.
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

  // Sin parámetros → cron, importa Azeta Total
  const result = await runCatalogImport(
    source_id   ? { source_id }   :
    source_name ? { source_name } :
    undefined
  )

  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
