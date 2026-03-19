/**
 * Supabase implementation of IMlAccountRepository
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { IMlAccountRepository } from "./interfaces"
import type { MlAccount } from "../domain/types"

export class SupabaseAccountRepository implements IMlAccountRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(accountId: string): Promise<MlAccount | null> {
    const { data, error } = await this.db
      .from("ml_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle()

    if (error) throw new Error(`DB error reading account: ${error.message}`)
    return data as MlAccount | null
  }
}
