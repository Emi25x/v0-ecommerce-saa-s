/**
 * @deprecated /api/azeta/update-stock
 *
 * El scheduling de stock AZETA ahora pasa por /api/cron/import-schedules,
 * que llama runAzetaStockUpdate() desde lib/azeta/update-stock-import.ts.
 * El cron ya no está en vercel.json — se controla desde la tabla import_schedules (UI).
 *
 * Esta ruta se mantiene como wrapper HTTP para disparos manuales o emergencias.
 * NO debe ser invocada por código interno ni agregada a vercel.json.
 */

import { NextResponse } from "next/server"
import { runAzetaStockUpdate } from "@/lib/azeta/update-stock-import"

export const maxDuration = 300

// GET para compatibilidad con llamadas directas
export async function GET(request: Request) {
  console.warn("[DEPRECATED] GET /api/azeta/update-stock — el scheduling corre por import-schedules")
  return POST(request)
}

export async function POST(request: Request) {
  console.warn("[DEPRECATED] POST /api/azeta/update-stock — el scheduling corre por import-schedules")

  // Verificar CRON_SECRET si está configurado
  const authHeader = (request as any).headers?.get?.("authorization") ?? ""
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader.replace("Bearer ", "") !== cronSecret) {
    const isCron = (request as any).headers?.get?.("x-vercel-cron") === "1"
    if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await runAzetaStockUpdate()
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
