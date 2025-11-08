import { NextResponse } from "next/server"

export async function POST() {
  try {
    console.log("[v0] Starting browser_preference migration...")

    const { createClient } = await import("@/lib/supabase/server")
    const supabase = await createClient()

    console.log("[v0] Supabase client created")

    const { error } = await supabase.rpc("exec_sql", {
      sql: `
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'ml_accounts' 
            AND column_name = 'browser_preference'
          ) THEN
            ALTER TABLE ml_accounts 
            ADD COLUMN browser_preference TEXT;
            
            COMMENT ON COLUMN ml_accounts.browser_preference IS 
            'Navegador o perfil preferido para abrir esta cuenta (ej: Chrome Perfil 1, Firefox)';
          END IF;
        END $$;
      `,
    })

    if (error) {
      console.error("[v0] Migration error:", error)
      // Si el error es que la función no existe, intentamos con una query directa
      if (error.message.includes("function") || error.message.includes("does not exist")) {
        console.log("[v0] Trying direct query approach...")

        // Intentar agregar la columna directamente
        const { error: alterError } = await supabase.from("ml_accounts").select("browser_preference").limit(1)

        if (alterError && alterError.message.includes("does not exist")) {
          // La columna no existe, pero no podemos agregarla desde aquí
          return NextResponse.json(
            {
              success: false,
              error:
                "No se puede ejecutar la migración automáticamente. Por favor, ejecuta este SQL manualmente en Supabase:\n\nALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS browser_preference TEXT;",
            },
            { status: 500 },
          )
        }

        // La columna ya existe
        return NextResponse.json({
          success: true,
          message: "La columna browser_preference ya existe",
        })
      }

      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    console.log("[v0] Migration completed successfully")
    return NextResponse.json({
      success: true,
      message: "Migración completada exitosamente",
    })
  } catch (error: any) {
    console.error("[v0] Migration failed:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
