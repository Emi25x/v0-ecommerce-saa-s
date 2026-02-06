import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET /api/cron/ml-import-worker
 * Cron job que ejecuta el worker automáticamente cada minuto
 * Procesa jobs en estado "processing" hasta completarlos
 */
export async function GET(request: Request) {
  console.log("[v0] ========== ML IMPORT WORKER CRON ==========")
  
  try {
    const supabase = await createClient()

    // Buscar jobs en estado processing
    const { data: jobs } = await supabase
      .from("ml_import_jobs")
      .select("*")
      .eq("status", "processing")
      .limit(5) // Procesar hasta 5 jobs simultáneos

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No hay jobs pendientes" 
      })
    }

    console.log("[v0] Found", jobs.length, "jobs to process")

    const results = []

    // Ejecutar worker para cada job
    for (const job of jobs) {
      try {
        const workerResponse = await fetch(
          `${process.env.NEXT_PUBLIC_VERCEL_URL || request.url.replace('/cron/ml-import-worker', '')}/api/ml/import/worker`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job_id: job.id, batch_size: 50 })
          }
        )

        const workerData = await workerResponse.json()
        
        results.push({
          job_id: job.id,
          success: workerResponse.ok,
          ...workerData
        })

      } catch (error: any) {
        console.error("[v0] Error processing job", job.id, error)
        results.push({
          job_id: job.id,
          success: false,
          error: error.message
        })
      }
    }

    return NextResponse.json({
      success: true,
      jobs_processed: jobs.length,
      results
    })

  } catch (error: any) {
    console.error("[v0] Error in cron worker:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
