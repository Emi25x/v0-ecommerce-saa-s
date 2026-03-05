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
 * Crea un registro de catálogo. Acepta JSON (cuando el archivo ya fue subido a Blob)
 * o FormData legacy.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? ""
    const supabase    = await createClient({ useServiceRole: true })

    // ── JSON path: file already uploaded to Blob by client ─────────────────
    if (contentType.includes("application/json")) {
      const body = await request.json()

      const {
        supplier_id, name, description = "",
        file_url, file_size_bytes, file_format = "xlsx",
        catalog_mode, overwrite_mode, warehouse_id, feed_kind = "catalog",
      } = body

      if (!supplier_id || !file_url) {
        return NextResponse.json({ error: "supplier_id and file_url required" }, { status: 400 })
      }

      const { data: catalog, error } = await supabase
        .from("supplier_catalogs")
        .insert({
          supplier_id,
          name,
          description,
          file_url,
          file_size_bytes: file_size_bytes ?? null,
          file_format,
          catalog_mode:   catalog_mode   ?? "update_only",
          overwrite_mode: overwrite_mode ?? "only_empty_fields",
          warehouse_id:   warehouse_id   ?? null,
          feed_kind,
          import_status:  "pending",
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ catalog })
    }

    // ── FormData path: legacy — file embedded in request ───────────────────
    const formData   = await request.formData()
    const file       = formData.get("file") as File | null
    const supplierId = formData.get("supplier_id") as string
    const name       = formData.get("name") as string
    const description = formData.get("description") as string

    if (!file || !supplierId) {
      return NextResponse.json({ error: "file and supplier_id required" }, { status: 400 })
    }

    const blob = await put(`catalogs/${supplierId}/${Date.now()}-${file.name}`, file, { access: "public" })

    const { data: catalog, error } = await supabase
      .from("supplier_catalogs")
      .insert({
        supplier_id: supplierId,
        name:          name || file.name,
        description,
        file_url:      blob.url,
        file_size_bytes: file.size,
        file_format:   file.name.split(".").pop()?.toLowerCase() || "csv",
        import_status: "pending",
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
