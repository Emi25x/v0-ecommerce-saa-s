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

    const { data: warehouse, error } = await supabase
      .from("warehouses")
      .insert({
        owner_user_id: user.id,
        name,
        code,
        address,
        notes,
        is_default: is_default || false,
      })
      .select()
      .single()

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
