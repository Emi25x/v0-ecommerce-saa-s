/**
 * GET /api/cron/reprice
 *
 * ── DEPRECATED ── Este cron legacy está desactivado.
 * El repricing ahora se ejecuta desde /api/cron/ml-reprice
 * que usa ml_price_strategies como fuente de verdad única.
 *
 * Este endpoint se mantiene para no romper vercel.json si
 * estaba configurado, pero no ejecuta lógica de repricing.
 */

import { NextRequest, NextResponse } from "next/server"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const log = createStructuredLogger({ request_id: genRequestId() })

  log.info(
    "Legacy reprice cron invoked — DEPRECATED. Use /api/cron/ml-reprice instead.",
    "reprice.deprecated",
  )

  return NextResponse.json({
    ok: true,
    deprecated: true,
    message:
      "Este cron está deprecado. El repricing ahora corre desde /api/cron/ml-reprice " +
      "usando ml_price_strategies como fuente de verdad única. " +
      "Remover esta entrada de vercel.json crons.",
    processed: 0,
    changed: 0,
  })
}
