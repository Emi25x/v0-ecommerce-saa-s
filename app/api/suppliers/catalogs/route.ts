import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { put } from "@vercel/blob"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const supplier_id = searchParams.get("supplier_id")

    let query = supabase
      .from("supplier_catalogs")
      .select("*, suppliers(name, code)")
      .order("created_at", { ascending: false })

    if (supplier_id) {
      query = query.eq("supplier_id", supplier_id)
    }

    const { data: catalogs, error } = await query

    if (error) {
      console.error("[v0] Error fetching catalogs:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ catalogs: catalogs || [] })
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const formData = await request.formData()

    const supplier_id = formData.get("supplier_id") as string
    const file = formData.get("file") as File
    const name = (formData.get("name") as string) || file.name

    if (!supplier_id || !file) {
      return NextResponse.json({ error: "supplier_id y file son requeridos" }, { status: 400 })
    }

    // Subir archivo a Vercel Blob
    const blob = await put(file.name, file, {
      access: "public",
    })

    // Crear registro en DB
    const { data: catalog, error } = await supabase
      .from("supplier_catalogs")
      .insert({
        supplier_id,
        name,
        file_url: blob.url,
        file_size_bytes: file.size,
        file_format: file.name.endsWith(".xlsx") ? "xlsx" : "csv",
        import_status: "pending",
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error creating catalog:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ catalog })
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
