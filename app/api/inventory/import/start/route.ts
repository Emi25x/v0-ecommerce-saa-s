import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { executeBatchImport } from "@/lib/import/batch-import"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sourceId, importMode } = body

    console.log("[v0] POST /api/inventory/import/start", { sourceId, importMode })

    const supabase = await createClient()

    // Crear registro de importación en estado "pending"
    const { data: historyRecord, error: historyError } = await supabase
      .from("import_history")
      .insert({
        source_id: sourceId,
        status: "pending",
        products_imported: 0,
        products_updated: 0,
        products_failed: 0,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (historyError) {
      console.error("[v0] Error creating history record:", historyError)
      return NextResponse.json({ error: historyError.message }, { status: 500 })
    }

    console.log("[v0] Created history record:", historyRecord.id)

    // Iniciar importación en background (llamada directa, sin self-fetch)
    executeBatchImport(sourceId, 0, importMode || "update", true)
      .then(async (r) => {
        console.log(`[v0] Import completed: created=${r.created}, updated=${r.updated}, failed=${r.failed}`)
        const sb = await createClient()
        await sb
          .from("import_history")
          .update({
            status: r.success ? "success" : "error",
            completed_at: new Date().toISOString(),
            products_imported: r.created,
            products_updated: r.updated,
            products_failed: r.failed,
            error_message: r.error ?? null,
          })
          .eq("id", historyRecord.id)
      })
      .catch(async (err) => {
        console.error("[v0] Error in background import:", err)
        const sb = await createClient()
        await sb
          .from("import_history")
          .update({
            status: "error",
            error_message: err.message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", historyRecord.id)
      })

    return NextResponse.json({ historyId: historyRecord.id })
  } catch (error: any) {
    console.error("[v0] Error in start endpoint:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
