import { type NextRequest, NextResponse } from "next/server"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    console.log("[v0] PATCH /api/mercadolibre/accounts/[id]/browser - Starting")

    const { browser_preference } = await request.json()
    const accountId = id

    console.log("[v0] Account ID:", accountId)
    console.log("[v0] Browser preference:", browser_preference)

    const { createClient } = await import("@/lib/db/server")
    const supabase = await createClient()

    console.log("[v0] Supabase client created successfully")

    const { error } = await supabase.from("ml_accounts").update({ browser_preference }).eq("id", accountId)

    // Si el error es por columna faltante, agregarla y reintentar
    if (error && error.message.includes("browser_preference")) {
      console.log("[v0] Column browser_preference doesn't exist, adding it...")

      // Agregar la columna usando SQL raw
      const { error: alterError } = await supabase.rpc("exec_sql", {
        sql: "ALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS browser_preference TEXT;",
      })

      if (alterError) {
        console.error("[v0] Error adding column:", alterError)
        // Intentar con una query directa si rpc no funciona
        try {
          const directRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
            method: "POST",
            headers: {
              apikey: process.env.SUPABASE_ANON_KEY || "",
              Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sql: "ALTER TABLE ml_accounts ADD COLUMN IF NOT EXISTS browser_preference TEXT;",
            }),
          })
          if (!directRes.ok) {
            console.error("[v0] Error with direct SQL:", await directRes.text())
          }
        } catch (directErr) {
          console.error("[v0] Error with direct SQL:", directErr)
        }
      }

      console.log("[v0] Column added, retrying update...")

      // Reintentar la actualización
      const result = await supabase.from("ml_accounts").update({ browser_preference }).eq("id", accountId)

      if (result.error) {
        console.error("[v0] Error updating after adding column:", result.error)
        return NextResponse.json({ error: result.error.message }, { status: 500 })
      }
    } else if (error) {
      console.error("[v0] Error updating browser preference:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log("[v0] Browser preference updated successfully")
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in browser preference update:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    )
  }
}
