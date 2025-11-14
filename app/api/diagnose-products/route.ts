import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 10

export async function GET() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Solo contar total de productos
    const { count } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    return NextResponse.json({
      totalProducts: count || 0,
      totalDuplicateSKUs: 0,
      message: "Para análisis completo de duplicados, usa los scripts SQL en Supabase",
      useSqlScripts: true
    })
  } catch (error: any) {
    return NextResponse.json(
      { 
        totalProducts: 0,
        totalDuplicateSKUs: 0,
        error: error.message,
        useSqlScripts: true
      },
      { status: 200 } // Devolver 200 en lugar de 500 para evitar errores en el cliente
    )
  }
}
