import { createAdminClient } from "@/lib/db/admin"
import { NextResponse } from "next/server"

/**
 * GET /api/suppliers
 * Lista todos los proveedores
 */
export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data: suppliers, error } = await supabase.from("suppliers").select("*").order("name")

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
    const supabase = createAdminClient()

    const payload = {
      name: body.name,
      code: body.code,
      type: body.type,
      country: body.country,
      contact_email: body.contact_email,
      contact_phone: body.contact_phone,
      api_config: body.api_config,
      is_active: body.is_active ?? true,
    }

    // Try insert, progressively truncating code if the column is too short
    const lengthsToTry = [payload.code?.length ?? 0, 20, 10, 5, 2]
      .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
      .sort((a, b) => b - a)

    let lastError: any = null
    for (const maxLen of lengthsToTry) {
      const { data: supplier, error } = await supabase
        .from("suppliers")
        .insert({ ...payload, code: payload.code?.slice(0, maxLen) ?? "" })
        .select()
        .single()

      if (!error) return NextResponse.json({ supplier })

      const isLengthError =
        error.message?.includes("character varying") ||
        error.message?.includes("too long") ||
        error.message?.includes("value too long")

      if (!isLengthError) throw error
      lastError = error
      console.warn(`[SUPPLIERS] code truncated to ${maxLen} chars still too long, trying shorter`)
    }

    throw lastError
  } catch (error: any) {
    console.error("[SUPPLIERS] POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
