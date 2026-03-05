import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// GET /api/shopify/export-templates?store_id=...
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const storeId = request.nextUrl.searchParams.get("store_id")
    if (!storeId) return NextResponse.json({ error: "store_id requerido" }, { status: 400 })

    // Verify store ownership
    const { data: store } = await supabase
      .from("shopify_stores")
      .select("id")
      .eq("id", storeId)
      .eq("owner_user_id", user.id)
      .maybeSingle()
    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })

    const { data: template } = await supabase
      .from("shopify_export_templates")
      .select("*")
      .eq("shopify_store_id", storeId)
      .maybeSingle()

    return NextResponse.json({ template: template ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/shopify/export-templates — upsert template for a store
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { store_id, template_columns_json, defaults_json } = await request.json()
    if (!store_id) return NextResponse.json({ error: "store_id requerido" }, { status: 400 })

    // Verify ownership
    const { data: store } = await supabase
      .from("shopify_stores")
      .select("id")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .maybeSingle()
    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })

    const { data, error } = await supabase
      .from("shopify_export_templates")
      .upsert(
        {
          shopify_store_id: store_id,
          template_columns_json: template_columns_json ?? [],
          defaults_json: defaults_json ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "shopify_store_id" },
      )
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, template: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
