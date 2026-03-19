/**
 * GET /api/shopify/price-lists
 *
 * Returns active price lists for the Shopify store config selector.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("price_lists")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("name")

    if (error) throw error

    return NextResponse.json({ ok: true, lists: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
