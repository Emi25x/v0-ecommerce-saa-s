import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: profiles, error } = await supabase
      .from("price_profiles")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profiles })
  } catch (error) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { name, margin_percent, listing_type_id, is_default } = body

    if (!name || margin_percent === undefined) {
      return NextResponse.json({ error: "Nombre y margen son requeridos" }, { status: 400 })
    }

    // Si es default, quitar default de los demás
    if (is_default) {
      await supabase.from("price_profiles").update({ is_default: false }).eq("is_default", true)
    }

    const { data: profile, error } = await supabase
      .from("price_profiles")
      .insert({
        name,
        margin_percent,
        listing_type_id: listing_type_id || "gold_special",
        is_default: is_default || false,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { id, is_default } = body

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    }

    // Si se está estableciendo como default, quitar default de los demás
    if (is_default) {
      await supabase.from("price_profiles").update({ is_default: false }).neq("id", id)
    }

    const { data: profile, error } = await supabase
      .from("price_profiles")
      .update({ is_default })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    }

    const { error } = await supabase.from("price_profiles").delete().eq("id", id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
