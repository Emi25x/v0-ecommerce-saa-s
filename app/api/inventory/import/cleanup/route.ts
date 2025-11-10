import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    console.log("[v0] Cleanup endpoint - Starting")
    const supabase = await createClient()

    // Buscar todas las importaciones en estado "in_progress"
    console.log("[v0] Querying import_history for in_progress status")
    const { data: stuckImports, error: fetchError } = await supabase
      .from("import_history")
      .select("*")
      .eq("status", "in_progress")

    console.log("[v0] Query result:", {
      count: stuckImports?.length || 0,
      error: fetchError,
    })

    if (fetchError) {
      console.error("[v0] Error fetching stuck imports:", fetchError)
      return NextResponse.json({ error: "Failed to fetch stuck imports", details: fetchError }, { status: 500 })
    }

    if (!stuckImports || stuckImports.length === 0) {
      console.log("[v0] No stuck imports found")
      return NextResponse.json({
        cleaned: 0,
        message: "No hay importaciones atascadas",
      })
    }

    console.log("[v0] Found", stuckImports.length, "stuck imports, updating to cancelled...")

    // Actualizar todas a "cancelled"
    const { error: updateError } = await supabase
      .from("import_history")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
      })
      .eq("status", "in_progress")

    if (updateError) {
      console.error("[v0] Error updating stuck imports:", updateError)
      return NextResponse.json({ error: "Failed to update stuck imports", details: updateError }, { status: 500 })
    }

    console.log("[v0] Successfully cleaned", stuckImports.length, "stuck imports")

    return NextResponse.json({
      cleaned: stuckImports.length,
      message: `Se cancelaron ${stuckImports.length} importaciones atascadas`,
    })
  } catch (error) {
    console.error("[v0] Unexpected error in cleanup endpoint:", error)
    return NextResponse.json({ error: "Unexpected error", details: String(error) }, { status: 500 })
  }
}
