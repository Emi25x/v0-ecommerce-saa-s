import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/cron/ml-import-tick
 * Ejecutado por Vercel Cron cada minuto
 * Avanza el proceso de importación ML automáticamente
 */
export async function POST(request: Request) {
  console.log("[CRON TICK] ========== ML IMPORT TICK ==========")
  
  const ranAt = new Date().toISOString()
  
  try {
    const supabase = await createClient()

    // Buscar job activo (indexing o processing)
    const { data: activeJob } = await supabase
      .from("ml_import_jobs")
      .select("*, ml_accounts(*)")
      .in("status", ["indexing", "processing"])
      .order("started_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!activeJob) {
      console.log("[CRON TICK] No active jobs to process")
      return NextResponse.json({ 
        ok: true,
        ranAt,
        message: "No active jobs"
      })
    }

    const offsetBefore = activeJob.current_offset || 0
    const totalItems = activeJob.total_items || 0
    
    console.log("[CRON TICK] Processing job:", activeJob.id, "| status:", activeJob.status, "| offset:", offsetBefore, "/", totalItems)

    const baseUrl = request.url.split("/api/")[0]

    // Si está en indexing, llamar a /index
    if (activeJob.status === "indexing") {
      const indexUrl = `${baseUrl}/api/ml/import/index`
      console.log("[CRON TICK] Calling index with offset:", offsetBefore)

      const indexResponse = await fetch(indexUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          job_id: activeJob.id, 
          account_id: activeJob.account_id,
          offset: offsetBefore
        })
      })

      if (!indexResponse.ok) {
        const errorText = await indexResponse.text()
        console.error("[CRON TICK] Index failed:", indexResponse.status, errorText)
        return NextResponse.json({ 
          ok: false, 
          error: `Index failed: ${errorText}` 
        }, { status: 500 })
      }

      const indexData = await indexResponse.json()
      console.log("[CRON TICK] Index result:", JSON.stringify(indexData))

      // Re-leer job para obtener offset actualizado
      const { data: updatedJob } = await supabase
        .from("ml_import_jobs")
        .select("current_offset, status")
        .eq("id", activeJob.id)
        .single()

      const offsetAfter = updatedJob?.current_offset || offsetBefore
      console.log("[CRON TICK] Job", activeJob.id, "offset:", offsetBefore, "→", offsetAfter)

      return NextResponse.json({
        ok: true,
        ranAt,
        job_id: activeJob.id,
        status: updatedJob?.status || activeJob.status,
        offset_before: offsetBefore,
        offset_after: offsetAfter,
        action: "indexed"
      })
    }

    // Si está en processing, llamar a /worker
    if (activeJob.status === "processing") {
      const workerUrl = `${baseUrl}/api/ml/import/worker`
      console.log("[CRON TICK] Calling worker with batch_size: 20")

      const workerResponse = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          job_id: activeJob.id,
          batch_size: 20
        })
      })

      if (!workerResponse.ok) {
        const errorText = await workerResponse.text()
        console.error("[CRON TICK] Worker failed:", workerResponse.status, errorText)
        return NextResponse.json({ 
          ok: false, 
          error: `Worker failed: ${errorText}` 
        }, { status: 500 })
      }

      const workerData = await workerResponse.json()
      console.log("[CRON TICK] Worker result:", JSON.stringify(workerData))

      // Re-leer job para estado actualizado
      const { data: updatedJob } = await supabase
        .from("ml_import_jobs")
        .select("current_offset, status")
        .eq("id", activeJob.id)
        .single()

      const offsetAfter = updatedJob?.current_offset || offsetBefore
      console.log("[CRON TICK] Job", activeJob.id, "processed - status:", updatedJob?.status)

      return NextResponse.json({
        ok: true,
        ranAt,
        job_id: activeJob.id,
        status: updatedJob?.status || activeJob.status,
        offset_before: offsetBefore,
        offset_after: offsetAfter,
        action: "processed"
      })
    }

    return NextResponse.json({ 
      ok: true,
      ranAt,
      job_id: activeJob.id,
      status: activeJob.status,
      offset_before: offsetBefore,
      offset_after: offsetBefore,
      action: "none",
      message: "Unknown job status"
    })

  } catch (error: any) {
    console.error("[CRON TICK] Error:", error)
    return NextResponse.json({ 
      ok: false,
      ranAt,
      error: error.message 
    }, { status: 500 })
  }
}
