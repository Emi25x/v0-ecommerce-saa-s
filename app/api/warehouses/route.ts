import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: warehouses, error } = await supabase
      .from("warehouses")
      .select("*")
      .eq("owner_user_id", user.id)
      .order("is_default", { ascending: false })
      .order("name")

    if (error) {
      console.error("[WAREHOUSES] Error fetching warehouses:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ warehouses })
  } catch (error) {
    console.error("[WAREHOUSES] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch warehouses" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, code, address, notes, is_default } = body

    if (!name || !code) {
      return NextResponse.json(
        { error: "Name and code are required" },
        { status: 400 }
      )
    }

    // If this is set as default, unset other defaults first
    if (is_default) {
      await supabase
        .from("warehouses")
        .update({ is_default: false })
        .eq("owner_user_id", user.id)
    }

    const insertPayload: Record<string, unknown> = {
      owner_user_id: user.id,
      name,
      code,
      address,
      is_default: is_default || false,
    }
    if (notes !== undefined) insertPayload.notes = notes

    let { data: warehouse, error } = await supabase
      .from("warehouses")
      .insert(insertPayload)
      .select()
      .single()

    // Fallback: if notes column is missing (schema cache not yet refreshed),
    // retry without it so the rest of the create still succeeds.
    if (error?.message?.includes("notes")) {
      console.error("[WAREHOUSES] notes column missing — retrying without it. Run migration: ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS notes text;")
      delete insertPayload.notes
      ;({ data: warehouse, error } = await supabase
        .from("warehouses")
        .insert(insertPayload)
        .select()
        .single())
    }

    if (error) {
      console.error("[WAREHOUSES] Error creating warehouse:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ warehouse })
  } catch (error) {
    console.error("[WAREHOUSES] Error:", error)
    return NextResponse.json(
      { error: "Failed to create warehouse" },
      { status: 500 }
    )
  }
}
