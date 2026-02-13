import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET /api/suppliers
 * Lista todos los proveedores
 */
export async function GET() {
  try {
    const supabase = await createClient({ useServiceRole: true })

    const { data: suppliers, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("name")

    if (error) throw error

    return NextResponse.json({ suppliers })
  } catch (error: any) {
    console.error("[SUPPLIERS] GET error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/suppliers
 * Crea un nuevo proveedor
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = await createClient({ useServiceRole: true })

    const { data: supplier, error } = await supabase
      .from("suppliers")
      .insert({
        name: body.name,
        code: body.code,
        type: body.type,
        country: body.country,
        contact_email: body.contact_email,
        contact_phone: body.contact_phone,
        api_config: body.api_config,
        is_active: body.is_active ?? true
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ supplier })
  } catch (error: any) {
    console.error("[SUPPLIERS] POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
