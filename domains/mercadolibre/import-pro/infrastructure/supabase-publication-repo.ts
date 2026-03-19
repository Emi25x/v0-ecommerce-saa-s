/**
 * Supabase implementation of IPublicationRepository
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { IPublicationRepository } from "./interfaces"
import type { PublicationRow } from "../domain/types"

export class SupabasePublicationRepository implements IPublicationRepository {
  constructor(private readonly db: SupabaseClient) {}

  async upsert(rows: PublicationRow[]): Promise<{ count: number; error: string | null }> {
    if (rows.length === 0) return { count: 0, error: null }

    const { error, count } = await this.db
      .from("ml_publications")
      .upsert(rows, { onConflict: "account_id,ml_item_id", count: "exact" })

    if (error) {
      return { count: 0, error: error.message }
    }

    // count may be null if driver doesn't support it; fallback to rows.length
    return { count: count ?? rows.length, error: null }
  }

  async countByAccount(accountId: string): Promise<number> {
    const { count } = await this.db
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)

    return count ?? 0
  }
}
