import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 60

/**
 * Verifica autenticación
 */
function authenticate(request: Request): boolean {
  const url = new URL(request.url)
  const secretFromQuery = url.searchParams.get("secret")
  const secretFromHeader = request.headers.get("x-cron-secret")
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    console.error("[v0] RUN - CRON_SECRET not configured")
    return false
  }

  return secretFromQuery === expectedSecret || secretFromHeader === expectedSecret
}

/**
 * Ejecuta un tick de importación (index o worker)
 */
async function executeSingleTick(supabase: any, baseUrl: string) {
  // Buscar job activo
  const { data: activeJob } = await supabase
    .from("ml_import_jobs")
    .select("*")
    .in("status", ["indexing", "processing"])
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!activeJob) {
    return { ok: false, reason: "no_active_job" }
  }

  const offsetBefore = activeJob.current_offset || 0

  // Si está en indexing, llamar a /index
  if (activeJob.status === "indexing") {
    const indexResponse = await fetch(`${baseUrl}/api/ml/import/index`, {
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
      return { ok: false, reason: "index_failed", error: errorText }
    }

    await indexResponse.json()

    // Re-leer job para obtener offset actualizado
    const { data: updatedJob } = await supabase
      .from("ml_import_jobs")
      .select("current_offset, status")
      .eq("id", activeJob.id)
      .single()

    return {
      ok: true,
      action: "indexed",
      job_id: activeJob.id,
      offset_before: offsetBefore,
      offset_after: updatedJob?.current_offset || offsetBefore,
      status: updatedJob?.status || activeJob.status
    }
  }

  // Si está en processing, llamar a /worker
  if (activeJob.status === "processing") {
    const workerResponse = await fetch(`${baseUrl}/api/ml/import/worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        job_id: activeJob.id,
        batch_size: 20
      })
    })

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text()
      return { ok: false, reason: "worker_failed", error: errorText }
    }

    await workerResponse.json()

    // Re-leer job para estado actualizado
    const { data: updatedJob } = await supabase
      .from("ml_import_jobs")
      .select("current_offset, status")
      .eq("id", activeJob.id)
      .single()

    return {
      ok: true,
      action: "processed",
      job_id: activeJob.id,
      offset_before: offsetBefore,
      offset_after: updatedJob?.current_offset || offsetBefore,
      status: updatedJob?.status || activeJob.status
    }
  }

  return { ok: false, reason: "unknown_status", status: activeJob.status }
}

/**
 * POST /api/ml/import/run
 * Ejecuta múltiples ticks en loop (máx 20s para evitar timeout)
 * Requiere CRON_SECRET
 */
export async function POST(request: Request) {
  console.log("[v0] ========== ML IMPORT RUN ==========")
  
  // Verificar autenticación
  if (!authenticate(request)) {
    console.error("[v0] RUN - Unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  const MAX_DURATION = 20000 // 20 segundos máximo
  const MAX_TICKS = 10 // Máximo 10 ticks por ejecución
  
  try {
    const supabase = await createClient()
    const baseUrl = request.url.split("/api/")[0]
    
    let ticksRun = 0
    let lastResult: any = null
    const results: any[] = []

    console.log("[v0] RUN - Starting multi-tick execution (max 20s, max 10 ticks)")

    // Ejecutar ticks en loop hasta timeout o max ticks
    while (ticksRun < MAX_TICKS && (Date.now() - startTime) < MAX_DURATION) {
      const result = await executeSingleTick(supabase, baseUrl)
      
      if (!result.ok) {
        console.log(`[v0] RUN - Tick ${ticksRun + 1} stopped:`, result.reason)
        lastResult = result
        break
      }

      ticksRun++
      lastResult = result
      results.push(result)
      
      console.log(`[v0] RUN - Tick ${ticksRun}/${MAX_TICKS} completed:`, result.action, "| offset:", result.offset_before, "→", result.offset_after)

      // Si el job cambió a "completed", detener
      if (result.status === "completed") {
        console.log("[v0] RUN - Job completed, stopping")
        break
      }

      // Pequeño delay para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const elapsed = Date.now() - startTime
    console.log(`[v0] RUN - Completed ${ticksRun} ticks in ${elapsed}ms`)

    return NextResponse.json({
      ok: true,
      ticksRun,
      elapsed,
      lastAction: lastResult?.action || "none",
      offset_before: results[0]?.offset_before || 0,
      offset_after: lastResult?.offset_after || 0,
      status: lastResult?.status || "unknown",
      results
    })

  } catch (error: any) {
    console.error("[v0] RUN - Error:", error)
    return NextResponse.json({ 
      ok: false,
      error: error.message 
    }, { status: 500 })
  }
}
