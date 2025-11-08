import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

console.log("[v0] ========================================")
console.log("[v0] IMPORT START ENDPOINT MODULE LOADING")
console.log("[v0] ========================================")

export async function POST(request: NextRequest) {
  console.log("[v0] ========================================")
  console.log("[v0] POST /api/inventory/import/start - CALLED")
  console.log("[v0] ========================================")

  try {
    const body = await request.json()
    const { sourceId, importMode } = body

    console.log("[v0] Request body:", { sourceId, importMode })

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

    // Iniciar importación en background (sin esperar)
    fetch(`${request.nextUrl.origin}/api/inventory/import/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ historyId: historyRecord.id, sourceId, importMode }),
    }).catch((error) => {
      console.error("[v0] Error starting background import:", error)
    })

    return NextResponse.json({ historyId: historyRecord.id })
  } catch (error: any) {
    console.error("[v0] Error in start endpoint:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
