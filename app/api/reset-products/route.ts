import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    const supabase = await createServerClient()

    console.log("[v0] Iniciando limpieza total de productos...")

    // Contar productos antes
    const { count: beforeCount, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error("[v0] Error al contar productos:", countError)
      throw countError
    }

    console.log(`[v0] Productos antes de limpieza: ${beforeCount}`)

    // Eliminar TODOS los productos
    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000") // Elimina todos excepto un ID imposible

    if (deleteError) {
      console.error("[v0] Error al eliminar productos:", deleteError)
      throw deleteError
    }

    // Verificar que se eliminaron todos
    const { count: afterCount } = await supabase.from("products").select("*", { count: "exact", head: true })

    console.log(`[v0] Productos después de limpieza: ${afterCount}`)

    return NextResponse.json({
      success: true,
      message: `Se eliminaron ${beforeCount} productos correctamente`,
      deleted: beforeCount,
      remaining: afterCount || 0,
    })
  } catch (error: any) {
    console.error("[v0] Error en limpieza total:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al eliminar productos",
      },
      { status: 500 },
    )
  }
}

// GET para confirmar cuántos productos se eliminarían
export async function GET() {
  try {
    const supabase = await createServerClient()

    const { count, error } = await supabase.from("products").select("*", { count: "exact", head: true })

    if (error) throw error

    return NextResponse.json({
      message: `Se eliminarán ${count} productos si ejecutas POST a este endpoint`,
      count: count || 0,
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
