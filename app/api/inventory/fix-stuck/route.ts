import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    const supabase = await createClient()

    // Actualizar directamente las importaciones atascadas
    const { data, error } = await supabase
      .from("import_history")
      .update({
        status: "cancelled",
        ended_at: new Date().toISOString(),
      })
      .eq("status", "in_progress")
      .select()

    if (error) throw error

    return NextResponse.json({
      success: true,
      fixed: data?.length || 0,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}
