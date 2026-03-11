import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

/**
 * GET /api/suppliers
 * Lista todos los proveedores
 */
export async function GET() {
  try {
    const supabase = createAdminClient()

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
    const supabase = createAdminClient()

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

    if (error) {
      // varchar(2) limit on code column — try to auto-expand via pg-meta then retry
      if (error.message?.includes("character varying") || error.message?.includes("too long")) {
        const expanded = await tryExpandSuppliersCode()
        if (expanded) {
          const { data: supplier2, error: err2 } = await supabase
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
          if (!err2) return NextResponse.json({ supplier: supplier2 })
        }
        return NextResponse.json({
          error: "El código del proveedor es demasiado largo. Ejecutá en el SQL Editor de Supabase: ALTER TABLE suppliers ALTER COLUMN code TYPE varchar(50);"
        }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ supplier })
  } catch (error: any) {
    console.error("[SUPPLIERS] POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Tries to expand suppliers.code column to varchar(50) via Supabase pg-meta API.
 * Returns true if successful, false otherwise.
 */
async function tryExpandSuppliersCode(): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) return false

    const sql = "ALTER TABLE suppliers ALTER COLUMN code TYPE varchar(50);"

    // Supabase pg-meta endpoint (works on self-hosted and some cloud configs)
    const res = await fetch(`${supabaseUrl}/pg-meta/v1/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    })

    if (res.ok) {
      console.log("[SUPPLIERS] Auto-expanded code column to varchar(50)")
      return true
    }
    console.warn("[SUPPLIERS] pg-meta expand failed:", res.status)
    return false
  } catch (e) {
    console.warn("[SUPPLIERS] tryExpandSuppliersCode error:", e)
    return false
  }
}
