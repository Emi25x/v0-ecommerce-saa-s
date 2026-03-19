import { type NextRequest, NextResponse } from "next/server"
import { requireCron } from "@/lib/auth/require-auth"
import { createClient } from "@/lib/db/server"

export async function POST(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response
  try {
    const { historyId } = await request.json()

    if (!historyId) {
      return NextResponse.json({ error: "History ID requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    // Actualizar el status a cancelled
    const { error } = await supabase
      .from("import_history")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        error_message: "Importación cancelada por el usuario",
      })
      .eq("id", historyId)
      .eq("status", "running") // Solo cancelar si está en running

    if (error) {
      console.error("[v0] Error cancelando importación:", error)
      return NextResponse.json({ error: "Error al cancelar importación" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Error en cancelación:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
