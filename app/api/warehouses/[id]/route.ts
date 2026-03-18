import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, code, address, notes, is_default } = body

    // If this is set as default, unset other defaults first
    if (is_default) {
      await supabase
        .from("warehouses")
        .update({ is_default: false })
        .eq("owner_user_id", user.id)
        .neq("id", id)
    }

    const updatePayload: Record<string, unknown> = {
      name,
      code,
      address,
      is_default,
    }
    if (notes !== undefined) updatePayload.notes = notes

    let { data: warehouse, error } = await supabase
      .from("warehouses")
      .update(updatePayload)
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .select()
      .single()

    // Fallback: if notes column is missing (schema cache not yet refreshed),
    // retry without it so the rest of the update still succeeds.
    if (error?.message?.includes("notes")) {
      console.error("[WAREHOUSES] notes column missing — retrying without it. Run migration: ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS notes text;")
      delete updatePayload.notes
      ;({ data: warehouse, error } = await supabase
        .from("warehouses")
        .update(updatePayload)
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .select()
        .single())
    }

    if (error) {
      console.error("[WAREHOUSES] Error updating warehouse:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!warehouse) {
      return NextResponse.json({ error: "Warehouse not found" }, { status: 404 })
    }

    return NextResponse.json({ warehouse })
  } catch (error) {
    console.error("[WAREHOUSES] Error:", error)
    return NextResponse.json(
      { error: "Failed to update warehouse" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if warehouse has catalog items
    const { count } = await supabase
      .from("supplier_catalog_items")
      .select("*", { count: "exact", head: true })
      .eq("warehouse_id", id)

    if (count && count > 0) {
      return NextResponse.json(
        { error: "Cannot delete warehouse with existing catalog items" },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from("warehouses")
      .delete()
      .eq("id", id)
      .eq("owner_user_id", user.id)

    if (error) {
      console.error("[WAREHOUSES] Error deleting warehouse:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[WAREHOUSES] Error:", error)
    return NextResponse.json(
      { error: "Failed to delete warehouse" },
      { status: 500 }
    )
  }
}
