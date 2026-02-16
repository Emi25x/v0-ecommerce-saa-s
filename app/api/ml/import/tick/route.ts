import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 60

/**
 * Verifica autenticación del cron
 */
function authenticate(request: Request): boolean {
  const url = new URL(request.url)
  const secretFromQuery = url.searchParams.get("secret")
  const secretFromHeader = request.headers.get("x-cron-secret")
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    console.error("[v0] TICK - CRON_SECRET not configured")
    return false
  }

  return secretFromQuery === expectedSecret || secretFromHeader === expectedSecret
}

/**
 * GET /api/ml/import/tick
 * Permite ejecución manual desde el browser con ?secret=...
 */
export async function GET(request: Request) {
  return handleTick(request)
}

/**
 * POST /api/ml/import/tick
 * Ejecutado por Vercel Cron cada minuto
 */
export async function POST(request: Request) {
  return handleTick(request)
}

/**
 * Handle tick logic
 */
async function handleTick(request: Request) {
  console.log("[v0] ========== ML IMPORT TICK ==========")
  
  // Verificar autenticación
  if (!authenticate(request)) {
    console.error("[v0] TICK - Unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
      console.log("[v0] TICK - No active jobs to process")
      return NextResponse.json({ 
        ok: true,
        ranAt,
        message: "No active jobs"
      })
    }

    const offsetBefore = activeJob.current_offset || 0
    const totalItems = activeJob.total_items || 0
    const currentOffset = offsetBefore; // Declare the currentOffset variable
    
    console.log("[v0] TICK - Processing job:", activeJob.id, "| status:", activeJob.status, "| offset:", offsetBefore, "/", totalItems)

    const baseUrl = request.url.split("/api/")[0]

    // Si está en indexing, llamar a /index
    if (activeJob.status === "indexing") {
      const indexUrl = `${baseUrl}/api/ml/import/index`
      console.log("[v0] TICK - Calling index with offset:", currentOffset)

      const indexResponse = await fetch(indexUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          job_id: activeJob.id, 
          account_id: activeJob.account_id,
          offset: currentOffset
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
      console.log("[v0] TICK - Index result:", JSON.stringify(indexData))

      // Re-leer job para obtener offset actualizado
      const { data: updatedJob } = await supabase
        .from("ml_import_jobs")
        .select("current_offset, status")
        .eq("id", activeJob.id)
        .single()

      return NextResponse.json({
        ok: true,
        ranAt,
        job_id: activeJob.id,
        status: updatedJob?.status || activeJob.status,
        offset_before: offsetBefore,
        offset_after: updatedJob?.current_offset || offsetBefore,
        action: "indexed"
      })
    }

    // Si está en processing, llamar a /worker
    if (activeJob.status === "processing") {
      const workerUrl = `${baseUrl}/api/ml/import/worker`
      console.log("[v0] TICK - Calling worker with batch_size: 20")

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
          ok: false, 
          error: `Worker failed: ${errorText}` 
        }, { status: 500 })
      }

      const workerData = await workerResponse.json()
      console.log("[v0] TICK - Worker result:", JSON.stringify(workerData))

      // Re-leer job para estado actualizado
      const { data: updatedJob } = await supabase
        .from("ml_import_jobs")
        .select("current_offset, status")
        .eq("id", activeJob.id)
        .single()

      return NextResponse.json({
        ok: true,
        ranAt,
        job_id: activeJob.id,
        status: updatedJob?.status || activeJob.status,
        offset_before: offsetBefore,
        offset_after: updatedJob?.current_offset || offsetBefore,
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
    console.error("[v0] Error in tick:", error)
    return NextResponse.json({ 
      ok: false,
      ranAt: new Date().toISOString(),
      error: error.message 
    }, { status: 500 })
  }
}
