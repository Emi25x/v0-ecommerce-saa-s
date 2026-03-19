/**
 * POST /api/market/scan/start
 * Crea un job de scan de mercado para la cuenta dada.
 * Si ya hay un job running, lo devuelve sin crear uno nuevo.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const { account_id, batch_size = 200 } = await req.json().catch(() => ({}))

  if (!account_id) {
    return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verificar cuenta
  const { data: account, error: accErr } = await supabase
    .from("ml_accounts")
    .select("id, nickname")
    .eq("id", account_id)
    .single()

  if (accErr || !account) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
  }

  // Si hay un job running, devolverlo sin crear uno nuevo
  const { data: running } = await supabase
    .from("market_scan_jobs")
    .select("*")
    .eq("account_id", account_id)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (running) {
    return NextResponse.json({ ok: true, job: running, resumed: true })
  }

  // Contar total de publicaciones con EAN válido (cualquiera de ean/isbn/gtin)
  const { count: totalEstimated } = await supabase
    .from("ml_publications")
    .select("*", { count: "exact", head: true })
    .eq("account_id", account_id)
    .or("ean.not.is.null,isbn.not.is.null,gtin.not.is.null")

  // Crear job
  const { data: job, error: jobErr } = await supabase
    .from("market_scan_jobs")
    .insert({
      account_id,
      status: "running",
      cursor: 0,
      batch_size: Math.min(Math.max(batch_size, 10), 500),
      total_estimated: totalEstimated ?? 0,
      started_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 })
  }

  console.log(`[MARKET-SCAN-START] job=${job.id} account=${account.nickname} total_estimated=${totalEstimated}`)

  return NextResponse.json({ ok: true, job, resumed: false })
}
