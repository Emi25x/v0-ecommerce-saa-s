import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { createAdminClient } from "@/lib/db/admin"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase.from("import_sources").select("id, name, feed_type").eq("id", id).single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("import_sources")
      .update({
        name: body.name,
        description: body.description,
        url_template: body.url_template,
        auth_type: body.auth_type,
        credentials: body.credentials ?? {},
        feed_type: body.feed_type,
        column_mapping: body.column_mapping,
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error updating import source:", error)
    return NextResponse.json({ error: "Error updating import source" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Use admin client to bypass RLS (import_sources has no DELETE policy for users)
    const supabaseAdmin = createAdminClient()

    // Clean up related records first
    await supabaseAdmin.from("import_schedules").delete().eq("source_id", id)

    const { error } = await supabaseAdmin.from("import_sources").delete().eq("id", id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting import source:", error)
    return NextResponse.json({ error: "Error deleting import source" }, { status: 500 })
  }
}
