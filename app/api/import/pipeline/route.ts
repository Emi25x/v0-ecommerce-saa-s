/**
 * POST /api/import/pipeline
 *
 * Execute the staged import pipeline for a source.
 * Body: { source_id: string } or { adapter: "arnoia_stock" | "libral_stock" }
 *
 * Uses the 5-phase pipeline: download → stage → validate → merge → post-process.
 * Accessible via cron (CRON_SECRET) or user session.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  // Accept both user auth and cron auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isCron = request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`

  if (!user && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { adapter, source_id } = body

    let result: any

    if (adapter === "arnoia_stock") {
      const { runArnoiaStockPipeline } = await import("@/lib/import/adapters/arnoia-stock")
      result = await runArnoiaStockPipeline(source_id)
    } else if (adapter === "libral_stock") {
      const { runLibralStockPipeline } = await import("@/lib/import/adapters/libral-stock")
      result = await runLibralStockPipeline(source_id)
    } else if (source_id) {
      // Resolve adapter from source metadata
      const { createAdminClient } = await import("@/lib/db/admin")
      const admin = createAdminClient()
      const { data: source } = await admin
        .from("import_sources")
        .select("name, source_key, feed_type")
        .eq("id", source_id)
        .single()

      if (!source) {
        return NextResponse.json({ error: "Source not found" }, { status: 404 })
      }

      const key = (source.source_key ?? "").toLowerCase()
      const name = (source.name ?? "").toLowerCase()

      if (key.includes("libral") || name.includes("libral")) {
        const { runLibralStockPipeline } = await import("@/lib/import/adapters/libral-stock")
        result = await runLibralStockPipeline(source_id)
      } else if (name.includes("arnoia")) {
        const { runArnoiaStockPipeline } = await import("@/lib/import/adapters/arnoia-stock")
        result = await runArnoiaStockPipeline(source_id)
      } else {
        return NextResponse.json({ error: `No pipeline adapter for source: ${source.name}. Use adapter parameter.` }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: "Specify adapter or source_id" }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
