import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Agregar la columna products_skipped si no existe
    const { error } = await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE import_history
        ADD COLUMN IF NOT EXISTS products_skipped integer DEFAULT 0;
      `,
    })

    if (error) {
      console.error("[v0] Error al agregar columna products_skipped:", error)

      // Si falla con RPC, intentar directamente con SQL
      const { error: directError } = await supabase.from("import_history").select("products_skipped").limit(1)

      if (directError && directError.code === "42703") {
        // La columna no existe, necesitamos agregarla manualmente
        return NextResponse.json({
          success: false,
          error: "No se puede agregar la columna automáticamente. Por favor, ejecuta el SQL manualmente en Supabase.",
          sql: "ALTER TABLE import_history ADD COLUMN IF NOT EXISTS products_skipped integer DEFAULT 0;",
        })
      }

      // La columna ya existe o hay otro error
      if (!directError) {
        return NextResponse.json({
          success: true,
          message: "La columna products_skipped ya existe",
        })
      }

      return NextResponse.json({
        success: false,
        error: error.message,
      })
    }

    return NextResponse.json({
      success: true,
      message: "Columna products_skipped agregada exitosamente",
    })
  } catch (error: any) {
    console.error("[v0] Error al agregar columna:", error)
    return NextResponse.json({
      success: false,
      error: error.message,
    })
  }
}
