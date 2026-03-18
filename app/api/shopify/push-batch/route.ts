import { createClient } from "@/lib/db/server"
import { NextRequest, NextResponse } from "next/server"
import { pushProductToShopify } from "@/domains/shopify/push-product"

export const maxDuration = 300

/**
 * POST /api/shopify/push-batch
 *
 * Two modes:
 *  1. Create job: { store_id, eans: string[] } → creates a shopify_push_jobs record, returns job_id
 *  2. Process job: { job_id } → processes up to 20 pending EANs, returns progress
 *
 * The UI can poll this endpoint or a cron can call it. Each call processes a small
 * batch so it stays within Vercel's time limits.
 *
 * GET /api/shopify/push-batch?job_id=X → returns job status without processing
 */

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

    const body = await req.json()

    // Mode 1: Create a new job
    if (body.eans && body.store_id) {
      const eans: string[] = [...new Set(body.eans.map((e: string) => String(e).trim()).filter(Boolean) as string[])]
      if (eans.length === 0)
        return NextResponse.json({ ok: false, error: "No EANs provided" }, { status: 400 })

      const { data: job, error } = await supabase
        .from("shopify_push_jobs")
        .insert({
          store_id: body.store_id,
          eans,
          total_count: eans.length,
          status: "pending",
          created_by: user.id,
        })
        .select("id")
        .single()

      if (error) {
        // Table might not exist yet — graceful fallback
        if (error.message?.includes("relation") && error.message?.includes("does not exist")) {
          return NextResponse.json({
            ok: false,
            error: "shopify_push_jobs table not found. Run migration 053_create_shopify_push_jobs.sql first.",
          }, { status: 500 })
        }
        throw error
      }

      return NextResponse.json({ ok: true, job_id: job.id, total: eans.length, status: "pending" })
    }

    // Mode 2: Process next batch from an existing job
    if (body.job_id) {
      return await processJobBatch(supabase, body.job_id, user.id)
    }

    return NextResponse.json({ ok: false, error: "Provide {store_id, eans} or {job_id}" }, { status: 400 })
  } catch (err: any) {
    console.error("[push-batch]", err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

    const jobId = req.nextUrl.searchParams.get("job_id")
    if (!jobId)
      return NextResponse.json({ ok: false, error: "job_id required" }, { status: 400 })

    const { data: job } = await supabase
      .from("shopify_push_jobs")
      .select("*")
      .eq("id", jobId)
      .single()

    if (!job)
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 })

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      status: job.status,
      total: job.total_count,
      completed: job.completed_count,
      failed: job.failed_count,
      remaining: job.total_count - job.completed_count - job.failed_count,
      percent: job.total_count > 0
        ? Math.round(((job.completed_count + job.failed_count) / job.total_count) * 100)
        : 0,
      failed_eans: job.failed_eans,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// ── Internal: process up to BATCH_LIMIT EANs from a job ─────────────────────

const BATCH_LIMIT = 20

async function processJobBatch(supabase: any, jobId: string, userId: string) {
  const { data: job, error } = await supabase
    .from("shopify_push_jobs")
    .select("*")
    .eq("id", jobId)
    .single()

  if (error || !job)
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 })

  if (job.status === "completed")
    return NextResponse.json({ ok: true, status: "completed", message: "Already done" })

  // Determine pending EANs
  const completedSet = new Set(job.completed_eans ?? [])
  const failedSet = new Set((job.failed_eans ?? []).map((f: any) => f.ean))
  const pendingEans = (job.eans as string[]).filter(e => !completedSet.has(e) && !failedSet.has(e))

  if (pendingEans.length === 0) {
    await supabase.from("shopify_push_jobs").update({
      status: "completed", updated_at: new Date().toISOString(),
    }).eq("id", jobId)
    return NextResponse.json({ ok: true, status: "completed", completed: job.completed_count, failed: job.failed_count })
  }

  // Mark as running
  if (job.status !== "running") {
    await supabase.from("shopify_push_jobs").update({
      status: "running", updated_at: new Date().toISOString(),
    }).eq("id", jobId)
  }

  const batch = pendingEans.slice(0, BATCH_LIMIT)
  const batchCompleted: string[] = []
  const batchFailed: { ean: string; error: string }[] = []

  // Process each EAN by calling the shared push-product logic directly (no self-fetch)
  for (const ean of batch) {
    try {
      const result = await pushProductToShopify(supabase, job.store_id, ean, userId)
      if (result.ok) {
        batchCompleted.push(ean)
      } else {
        batchFailed.push({ ean, error: result.error ?? "unknown" })
      }
    } catch (err: any) {
      batchFailed.push({ ean, error: err.message ?? "push_failed" })
    }
  }

  // Update job atomically
  const newCompleted = [...(job.completed_eans ?? []), ...batchCompleted]
  const newFailed = [...(job.failed_eans ?? []), ...batchFailed]
  const newCompletedCount = newCompleted.length
  const newFailedCount = newFailed.length
  const allDone = newCompletedCount + newFailedCount >= job.total_count

  await supabase.from("shopify_push_jobs").update({
    completed_eans: newCompleted,
    failed_eans: newFailed,
    completed_count: newCompletedCount,
    failed_count: newFailedCount,
    status: allDone ? "completed" : "running",
    updated_at: new Date().toISOString(),
  }).eq("id", jobId)

  return NextResponse.json({
    ok: true,
    status: allDone ? "completed" : "running",
    batch_processed: batch.length,
    batch_completed: batchCompleted.length,
    batch_failed: batchFailed.length,
    total: job.total_count,
    completed: newCompletedCount,
    failed: newFailedCount,
    remaining: job.total_count - newCompletedCount - newFailedCount,
  })
}
