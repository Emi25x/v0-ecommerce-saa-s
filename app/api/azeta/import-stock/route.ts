import { type NextRequest, NextResponse } from "next/server"
import { requireCron } from "@/lib/auth/require-auth"
import { createAdminClient } from "@/lib/db/admin"
import { runAzetaStockUpdate } from "@/domains/suppliers/azeta/stock-import"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutos

const log = createStructuredLogger({ request_id: genRequestId() })

// Vercel Cron invoca con GET — delegar a POST
export async function GET(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response
  const isCron = request.headers.get("x-vercel-cron") === "1"
  log.info("Azeta stock import triggered", "azeta.stock", { trigger: isCron ? "cron" : "manual" })
  return POST(request)
}

export async function POST(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response
  const supabase = createAdminClient()

  try {
    // Obtener fuente Azeta Stock desde import_sources
    const { data: source } = await supabase
      .from("import_sources")
      .select("id, url_template, name, source_key")
      .ilike("name", "%azeta%stock%")
      .eq("is_active", true)
      .maybeSingle()

    if (!source?.url_template) {
      return NextResponse.json({ error: "Fuente Azeta Stock no encontrada o sin URL configurada" }, { status: 400 })
    }

    // Delegar a la función central que ya maneja CSV sin headers (col0=EAN, col1=stock)
    const result = await runAzetaStockUpdate(source)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      stats: {
        processed: result.processed,
        updated: result.updated,
        not_found: result.not_found,
        zeroed: result.zeroed,
        skipped: result.skipped,
        duration_ms: result.elapsed_ms,
      },
    })
  } catch (error: any) {
    log.error("Fatal error in azeta stock import", error, "azeta.stock_fatal")
    return NextResponse.json({ error: error.message || "Stock update failed" }, { status: 500 })
  }
}
