/**
 * Refresh warehouse snapshots after a stock import.
 * Finds which warehouses use the given source_key and refreshes them.
 *
 * Safe to call: if the RPC or tables don't exist, it silently skips.
 */

import { createAdminClient } from "@/lib/db/admin"

export async function refreshWarehousesForSource(sourceKey: string): Promise<void> {
  try {
    const admin = createAdminClient()

    // Find warehouses linked to this source
    const { data: sources } = await admin
      .from("import_sources")
      .select("warehouse_id")
      .eq("source_key", sourceKey)
      .not("warehouse_id", "is", null)

    if (!sources || sources.length === 0) return

    // Refresh each affected warehouse
    for (const source of sources) {
      try {
        await admin.rpc("refresh_warehouse_products", {
          p_warehouse_id: source.warehouse_id,
        })
      } catch {
        // RPC not installed yet — skip silently
      }
    }
  } catch {
    // Non-critical — skip silently
  }
}

/**
 * Refresh a specific warehouse snapshot.
 */
export async function refreshWarehouse(warehouseId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.rpc("refresh_warehouse_products", { p_warehouse_id: warehouseId })
  } catch {
    // Non-critical — skip silently
  }
}
