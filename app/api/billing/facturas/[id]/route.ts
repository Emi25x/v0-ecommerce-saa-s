import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: factura, error } = await supabase
      .from("facturas")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single()

    if (error || !factura) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    return NextResponse.json({ ok: true, factura })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
