import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const tablesToCheck = [
      { name: "products", query: supabase.from("products").select("id").limit(1) },
      { name: "ml_listings", query: supabase.from("ml_listings").select("id").limit(1) },
      { name: "import_sources", query: supabase.from("import_sources").select("id").limit(1) },
      { name: "publication_destinations", query: supabase.from("publication_destinations").select("id").limit(1) },
    ]

    const checks = await Promise.all(tablesToCheck.map((t) => t.query))

    const missingTables: string[] = []
    let hasOtherErrors = false

    checks.forEach((check, index) => {
      if (check.error) {
        // Código 42P01 = tabla no existe
        if (check.error.code === "42P01") {
          missingTables.push(tablesToCheck[index].name)
        } else {
          // Otro tipo de error (permisos, conexión, etc.)
          console.error(`[v0] Error verificando tabla ${tablesToCheck[index].name}:`, check.error)
          hasOtherErrors = true
        }
      }
    })

    const needsMigration = missingTables.length > 0 || hasOtherErrors

    return NextResponse.json({
      needsMigration,
      missingTables,
      hasOtherErrors,
    })
  } catch (error) {
    console.error("[v0] Error verificando migraciones:", error)
    return NextResponse.json({
      needsMigration: true,
      missingTables: [],
      error: error instanceof Error ? error.message : "Error desconocido",
    })
  }
}
