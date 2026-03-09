import { type NextRequest, NextResponse } from "next/server"
import { runCatalogImport } from "@/lib/azeta/run-catalog-import"

export const maxDuration = 300

/**
 * GET/POST /api/azeta/import-catalog
 *
 * Ruta oficial del cron para importación completa de catálogo AZETA (Azeta Total).
 * Invocada por Vercel Cron cada domingo a las 3:00 AM (ver vercel.json).
 *
 * Para importaciones manuales desde la UI (resumables con progreso) usar:
 *   POST /api/azeta/download  → descarga ZIP a Blob
 *   POST /api/azeta/process   → procesa en chunks
 */

// Vercel Cron invoca con GET
export async function GET(request: NextRequest) {
  return POST(request)
}

export async function POST(_request: NextRequest) {
  // Siempre importa "Azeta Total" (catálogo completo) — fuente configurada en import_sources
  const result = await runCatalogImport({ source_name: "Azeta Total" })
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
