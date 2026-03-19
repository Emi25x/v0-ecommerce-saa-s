import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const catalogId = id
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: catalog, error: catalogError } = await supabase
      .from("supplier_catalogs")
      .select("*, supplier:suppliers(*)")
      .eq("id", catalogId)
      .single()

    if (catalogError || !catalog) {
      return NextResponse.json({ error: "Catalog not found" }, { status: 404 })
    }

    return NextResponse.json({ catalog })
  } catch (error) {
    console.error("[CATALOG-GET] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const catalogId = id
    const body = await request.json()
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name, description, feed_type, url_template, auth_type, credentials, column_mapping } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (feed_type !== undefined) updateData.feed_type = feed_type
    if (url_template !== undefined) updateData.url_template = url_template
    if (auth_type !== undefined) updateData.auth_type = auth_type
    if (credentials !== undefined) updateData.credentials = credentials
    if (column_mapping !== undefined) updateData.column_mapping = column_mapping

    const { data: catalog, error: updateError } = await supabase
      .from("supplier_catalogs")
      .update(updateData)
      .eq("id", catalogId)
      .select()
      .single()

    if (updateError) {
      console.error("[CATALOG-UPDATE] Error:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ catalog })
  } catch (error) {
    console.error("[CATALOG-UPDATE] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const catalogId = id
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error: deleteError } = await supabase.from("supplier_catalogs").delete().eq("id", catalogId)

    if (deleteError) {
      console.error("[CATALOG-DELETE] Error:", deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[CATALOG-DELETE] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
