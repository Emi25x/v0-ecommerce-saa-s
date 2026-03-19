import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { executeIndexBatch } from "@/domains/mercadolibre/import/index-logic"
import { executeWorkerBatch } from "@/domains/mercadolibre/import/worker-logic"

export const maxDuration = 30

/**
 * GET/POST /api/ml/import/advance?secret=XXX
 * Ejecuta UN tick de importación (indexing o processing)
 * Puede ser llamado desde el browser directamente
 */
async function handleAdvance(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get("secret")

  // Validar secret
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[v0] ADVANCE - Starting...")

  try {
    const supabase = await createClient()

    // Buscar job activo
    const { data: activeJob } = await supabase
      .from("ml_import_jobs")
      .select("*")
      .in("status", ["indexing", "processing"])
      .order("started_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!activeJob) {
      return NextResponse.json({
        ok: false,
        message: "No active jobs",
      })
    }

    const offsetBefore = activeJob.current_offset || 0

    // Si está indexing, ejecutar index batch directamente
    if (activeJob.status === "indexing") {
      console.log("[v0] ADVANCE - Running index with offset:", offsetBefore)

      const indexData = await executeIndexBatch(supabase, {
        job_id: activeJob.id,
        account_id: activeJob.account_id,
        offset: offsetBefore,
      })

      // Re-leer offset actualizado
      const { data: updatedJob } = await supabase
        .from("ml_import_jobs")
        .select("current_offset, status")
        .eq("id", activeJob.id)
        .single()

      const offsetAfter = updatedJob?.current_offset || offsetBefore

      console.log("[v0] ADVANCE - Index complete. Offset:", offsetBefore, "→", offsetAfter)

      return NextResponse.json({
        ok: true,
        action: "indexed",
        job_id: activeJob.id,
        status: updatedJob?.status || activeJob.status,
        offset_before: offsetBefore,
        offset_after: offsetAfter,
        items_indexed: indexData.items_indexed || 0,
      })
    }

    // Si está processing, ejecutar worker batch directamente
    if (activeJob.status === "processing") {
      console.log("[v0] ADVANCE - Running worker...")

      const workerData = await executeWorkerBatch(supabase, {
        job_id: activeJob.id,
        batch_size: 20,
      })

      console.log("[v0] ADVANCE - Worker complete. Processed:", workerData.processed || 0)

      return NextResponse.json({
        ok: true,
        action: "processed",
        job_id: activeJob.id,
        status: workerData.status || "processing",
        offset_before: offsetBefore,
        offset_after: offsetBefore,
        items_processed: workerData.processed || 0,
      })
    }

    return NextResponse.json({
      ok: false,
      message: "Unknown job status",
      status: activeJob.status,
    })
  } catch (error: any) {
    console.error("[v0] ADVANCE - Error:", error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return handleAdvance(request)
}

export async function POST(request: Request) {
  return handleAdvance(request)
}
