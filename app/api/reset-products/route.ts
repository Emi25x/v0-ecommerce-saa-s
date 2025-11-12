import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  console.log("[v0] ========================================")
  console.log("[v0] LIMPIEZA TOTAL - ENDPOINT LLAMADO")
  console.log("[v0] ========================================")

  try {
    const body = await request.json()
    const { confirmation } = body

    console.log("[v0] Confirmación recibida:", confirmation)

    if (confirmation !== "ELIMINAR TODO") {
      console.log("[v0] Confirmación incorrecta")
      return NextResponse.json(
        {
          success: false,
          error: 'Confirmación incorrecta. Debes escribir exactamente "ELIMINAR TODO"',
        },
        { status: 400 },
      )
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    console.log("[v0] Supabase URL disponible:", !!supabaseUrl)
    console.log("[v0] Supabase Key disponible:", !!supabaseKey)

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Faltan credenciales de Supabase")
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    console.log("[v0] Cliente Supabase creado exitosamente")

    // Contar productos antes
    console.log("[v0] Contando productos antes de eliminar...")
    const { count: beforeCount, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error("[v0] Error al contar productos:", countError)
      throw countError
    }

    console.log(`[v0] Productos antes de limpieza: ${beforeCount}`)

    if (!beforeCount || beforeCount === 0) {
      return NextResponse.json({
        success: true,
        message: "No hay productos para eliminar",
        deleted: 0,
        remaining: 0,
      })
    }

    // Eliminar TODOS los productos
    console.log("[v0] Eliminando todos los productos...")
    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")

    if (deleteError) {
      console.error("[v0] Error al eliminar productos:", deleteError)
      throw deleteError
    }

    // Verificar que se eliminaron todos
    console.log("[v0] Verificando eliminación...")
    const { count: afterCount } = await supabase.from("products").select("*", { count: "exact", head: true })

    console.log(`[v0] Productos después de limpieza: ${afterCount}`)
    console.log("[v0] ========================================")
    console.log("[v0] LIMPIEZA COMPLETADA EXITOSAMENTE")
    console.log("[v0] ========================================")

    return NextResponse.json({
      success: true,
      message: `Se eliminaron ${beforeCount} productos correctamente. Ahora ejecuta las importaciones en orden: Arnoia → Arnoia Act → Arnoia Stock`,
      deleted: beforeCount,
      remaining: afterCount || 0,
    })
  } catch (error: any) {
    console.error("[v0] ========================================")
    console.error("[v0] ERROR EN LIMPIEZA TOTAL:", error)
    console.error("[v0] Error stack:", error.stack)
    console.error("[v0] ========================================")
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al eliminar productos",
        details: error.stack,
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  console.log("[v0] GET /api/reset-products - Consulta de conteo")

  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Faltan credenciales de Supabase")
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { count, error } = await supabase.from("products").select("*", { count: "exact", head: true })

    if (error) throw error

    console.log(`[v0] Productos actuales en BD: ${count}`)

    return NextResponse.json({
      message: `Hay ${count} productos en la base de datos`,
      count: count || 0,
    })
  } catch (error: any) {
    console.error("[v0] Error en GET:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}
