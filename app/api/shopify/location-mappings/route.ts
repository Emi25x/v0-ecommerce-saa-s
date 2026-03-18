/**
 * GET  /api/shopify/location-mappings?store_id=
 *   → { ok, mappings: [{ id, warehouse_id, shopify_location_id, location_name, warehouse }] }
 *
 * POST /api/shopify/location-mappings
 *   Body: { store_id, mappings: [{ warehouse_id, shopify_location_id, location_name }] }
 *   → upsert all mappings for the store (replaces existing set)
 *
 * DELETE /api/shopify/location-mappings?id=<mapping_id>
 *   → removes a single mapping
 */

import { createClient } from "@/lib/db/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const supabase  = await createClient()
    const store_id  = req.nextUrl.searchParams.get("store_id")
    if (!store_id) return NextResponse.json({ ok: false, error: "store_id requerido" }, { status: 400 })

    const { data, error } = await supabase
      .from("shopify_location_mappings")
      .select(`id, warehouse_id, shopify_location_id, location_name, warehouses(id, name, country, code)`)
      .eq("store_id", store_id)
      .order("created_at")

    if (error) throw error
    return NextResponse.json({ ok: true, mappings: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { store_id, mappings } = await req.json()

    if (!store_id || !Array.isArray(mappings)) {
      return NextResponse.json({ ok: false, error: "store_id y mappings[] son requeridos" }, { status: 400 })
    }

    // Delete existing mappings for this store, then re-insert
    await supabase.from("shopify_location_mappings").delete().eq("store_id", store_id)

    if (mappings.length > 0) {
      const rows = mappings
        .filter((m: any) => m.warehouse_id && m.shopify_location_id)
        .map((m: any) => ({
          store_id,
          warehouse_id:        m.warehouse_id,
          shopify_location_id: String(m.shopify_location_id),
          location_name:       m.location_name ?? null,
          updated_at:          new Date().toISOString(),
        }))

      if (rows.length) {
        const { error } = await supabase.from("shopify_location_mappings").insert(rows)
        if (error) throw error
      }
    }

    return NextResponse.json({ ok: true, saved: mappings.length })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 })

    const { error } = await supabase.from("shopify_location_mappings").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
