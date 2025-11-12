import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    console.log("[v0] ========================================")
    console.log("[v0] LIMPIEZA TOTAL DE PRODUCTOS - INICIANDO")
    console.log("[v0] ========================================")

    const body = await request.json()
    const { confirmation } = body

    if (confirmation !== "ELIMINAR TODO") {
      console.log("[v0] Confirmación incorrecta:", confirmation)
      return NextResponse.json({ error: "Confirmación incorrecta" }, { status: 400 })
    }

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

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
      .neq("id", "00000000-0000-0000-0000-000000000000")

    if (deleteError) {
      console.error("[v0] Error al eliminar productos:", deleteError)
      throw deleteError
    }

    // Verificar que se eliminaron todos
    const { count: afterCount } = await supabase.from("products").select("*", { count: "exact", head: true })

    console.log(`[v0] Productos después de limpieza: ${afterCount}`)
    console.log("[v0] ========================================")
    console.log("[v0] LIMPIEZA COMPLETADA")
    console.log("[v0] ========================================")

    return NextResponse.json({
      success: true,
      message: `Se eliminaron ${beforeCount} productos correctamente`,
      deleted: beforeCount,
      remaining: afterCount || 0,
    })
  } catch (error: any) {
    console.error("[v0] ========================================")
    console.error("[v0] ERROR EN LIMPIEZA TOTAL:", error)
    console.error("[v0] ========================================")
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al eliminar productos",
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

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
