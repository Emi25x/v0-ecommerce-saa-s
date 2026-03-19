import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const supabase = await createClient()

    const { data, error } = await supabase.from("publication_destinations").update(body).eq("id", id).select().single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error updating destination:", error)
    return NextResponse.json({ error: "Error al actualizar destino" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("publication_destinations").delete().eq("id", id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting destination:", error)
    return NextResponse.json({ error: "Error al eliminar destino" }, { status: 500 })
  }
}
