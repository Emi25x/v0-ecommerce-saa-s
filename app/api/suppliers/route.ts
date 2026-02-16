import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: suppliers, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("is_active", true)
      .order("name")

    if (error) {
      console.error("[v0] Error fetching suppliers:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ suppliers: suppliers || [] })
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { name, code, type, country, contact_email, contact_phone } = body

    if (!name || !code || !type) {
      return NextResponse.json({ error: "name, code y type son requeridos" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        name,
        code,
        type,
        country,
        contact_email,
        contact_phone,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error creating supplier:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ supplier: data })
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
