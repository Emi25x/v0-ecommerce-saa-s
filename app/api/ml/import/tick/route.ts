import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 60

/**
 * POST /api/ml/import/tick
 * Avanza un paso del proceso de importación ML:
 * - Si hay job en "indexing": llama a /index para indexar un batch
 * - Si hay job en "processing": llama a /worker para procesar un batch
 * - Llamado automáticamente por cron cada minuto
 */
export async function POST(request: Request) {
  console.log("[v0] ========== ML IMPORT TICK ==========")
  
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
      console.log("[v0] No active jobs to process")
      return NextResponse.json({ 
        success: true, 
        message: "No active jobs" 
      })
    }

    console.log("[v0] Processing job:", activeJob.id, "status:", activeJob.status)

    const baseUrl = request.url.split("/api/")[0]

    // Si está en indexing, llamar a /index
    if (activeJob.status === "indexing") {
      const indexUrl = `${baseUrl}/api/ml/import/index`
      console.log("[v0] Calling index:", indexUrl)

      const indexResponse = await fetch(indexUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          job_id: activeJob.id, 
          account_id: activeJob.account_id,
          offset: activeJob.current_offset || 0
        })
      })

      if (!indexResponse.ok) {
        const errorText = await indexResponse.text()
        console.error("[v0] Index failed:", indexResponse.status, errorText)
        return NextResponse.json({ 
          success: false, 
          error: `Index failed: ${errorText}` 
        }, { status: 500 })
      }

      const indexData = await indexResponse.json()
      console.log("[v0] Index result:", indexData)

      return NextResponse.json({
        success: true,
        action: "indexed",
        job_id: activeJob.id,
        ...indexData
      })
    }

    // Si está en processing, llamar a /worker
    if (activeJob.status === "processing") {
      const workerUrl = `${baseUrl}/api/ml/import/worker`
      console.log("[v0] Calling worker:", workerUrl)

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
        console.error("[v0] Worker failed:", workerResponse.status, errorText)
        return NextResponse.json({ 
          success: false, 
          error: `Worker failed: ${errorText}` 
        }, { status: 500 })
      }

      const workerData = await workerResponse.json()
      console.log("[v0] Worker result:", workerData)

      return NextResponse.json({
        success: true,
        action: "processed",
        job_id: activeJob.id,
        ...workerData
      })
    }

    return NextResponse.json({ 
      success: true, 
      message: "Unknown job status",
      status: activeJob.status
    })

  } catch (error: any) {
    console.error("[v0] Error in tick:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
