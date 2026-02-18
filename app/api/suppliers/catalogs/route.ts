import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { put } from "@vercel/blob"

/**
 * GET /api/suppliers/catalogs?supplier_id=xxx
 * Lista catálogos de un proveedor
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get("supplier_id")

    const supabase = await createClient({ useServiceRole: true })

    let query = supabase
      .from("supplier_catalogs")
      .select(`
        *,
        supplier:suppliers(name, code)
      `)
      .order("created_at", { ascending: false })

    if (supplierId) {
      query = query.eq("supplier_id", supplierId)
    }

    const { data: catalogs, error } = await query

    if (error) throw error

    return NextResponse.json({ catalogs })
  } catch (error: any) {
    console.error("[CATALOGS] GET error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/suppliers/catalogs
 * Sube y crea un nuevo catálogo
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const supplierId = formData.get("supplier_id") as string
    const name = formData.get("name") as string
    const description = formData.get("description") as string

    if (!file || !supplierId) {
      return NextResponse.json(
        { error: "file and supplier_id required" },
        { status: 400 }
      )
    }

    // Upload file to Vercel Blob
    const blob = await put(`catalogs/${supplierId}/${Date.now()}-${file.name}`, file, {
      access: "public"
    })

    const supabase = await createClient({ useServiceRole: true })

    // Create catalog record
    const { data: catalog, error } = await supabase
      .from("supplier_catalogs")
      .insert({
        supplier_id: supplierId,
        name: name || file.name,
        description,
        file_url: blob.url,
        file_size_bytes: file.size,
        file_format: file.name.split(".").pop()?.toLowerCase() || "csv",
        import_status: "pending"
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ catalog })
  } catch (error: any) {
    console.error("[CATALOGS] POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
