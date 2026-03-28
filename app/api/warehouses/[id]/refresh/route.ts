/**
 * POST /api/warehouses/[id]/refresh
 *
 * Manually refresh the warehouse_products snapshot.
 * Called after imports or when data seems stale.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { createAdminClient } from "@/lib/db/admin"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: warehouseId } = await params
  const admin = createAdminClient()

  try {
    const { data, error } = await admin.rpc("refresh_warehouse_products", {
      p_warehouse_id: warehouseId,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, result: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
