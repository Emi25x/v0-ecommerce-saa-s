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

    // Buscar jobs en estado processing o indexing
    const { data: jobs } = await supabase
      .from("ml_import_jobs")
      .select("*")
      .in("status", ["processing", "indexing"])
      .limit(5) // Procesar hasta 5 jobs simultáneos

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No hay jobs pendientes" 
      })
    }

    console.log("[v0] Found", jobs.length, "jobs to process")

    const results = []

    // Ejecutar worker o indexer según el estado del job
    for (const job of jobs) {
      // Si está en indexing, continuar indexando primero
      if (job.status === "indexing") {
        try {
          const indexResponse = await fetch(
            `${process.env.NEXT_PUBLIC_VERCEL_URL || request.url.replace('/cron/ml-import-worker', '')}/api/ml/import/index`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                job_id: job.id, 
                account_id: job.account_id,
                offset: job.current_offset || 0
              })
            }
          )

          const indexData = await indexResponse.json()
          results.push({
            job_id: job.id,
            type: "index",
            success: indexResponse.ok,
            ...indexData
          })
          
          continue // Continuar con el siguiente job
        } catch (error: any) {
          console.error("[v0] Error indexing job", job.id, error)
          results.push({
            job_id: job.id,
            type: "index",
            success: false,
            error: error.message
          })
          continue
        }
      }

      // Si está en processing, ejecutar worker
      try {
        const workerResponse = await fetch(
          `${process.env.NEXT_PUBLIC_VERCEL_URL || request.url.replace('/cron/ml-import-worker', '')}/api/ml/import/worker`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job_id: job.id, batch_size: 20 })
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
