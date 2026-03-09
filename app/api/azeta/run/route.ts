/**
 * @deprecated /api/azeta/run
 *
 * Esta ruta queda deprecada. La lógica fue extraída a lib/azeta/run-catalog-import.ts.
 *
 * Rutas oficiales de reemplazo:
 *   - Cron catálogo completo → POST /api/azeta/import-catalog
 *   - Importación manual UI  → POST /api/azeta/download + POST /api/azeta/process
 *
 * Se mantiene temporalmente para compatibilidad con llamadas externas directas,
 * pero NO debe ser invocada por código interno ni por el cron.
 */

import { NextRequest, NextResponse } from "next/server"
import { runCatalogImport } from "@/lib/azeta/run-catalog-import"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET() {
  return NextResponse.json({ ok: true, route: "azeta-run-v2", deprecated: true })
}

export async function POST(request: NextRequest) {
  console.warn(
    "[DEPRECATED] POST /api/azeta/run — " +
    "usar POST /api/azeta/import-catalog (cron) o POST /api/azeta/download + /api/azeta/process (UI)"
  )
  const body = await request.json().catch(() => ({}))
  const result = await runCatalogImport(body as { source_id?: string; source_name?: string })
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
