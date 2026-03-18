import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { nickname } = await request.json()

    if (!nickname) {
      return NextResponse.json({ error: "Nickname is required" }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase.from("ml_accounts").update({ nickname }).eq("id", params.id)

    if (error) {
      console.error("[v0] Error updating nickname:", error)
      return NextResponse.json({ error: "Failed to update nickname" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in PATCH /api/mercadolibre/accounts/[id]/nickname:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
