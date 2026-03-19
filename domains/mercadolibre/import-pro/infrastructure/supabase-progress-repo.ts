/**
 * Supabase implementation of IImportProgressRepository
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { IImportProgressRepository } from "./interfaces"
import type { ImportProgress } from "../domain/types"

export class SupabaseProgressRepository implements IImportProgressRepository {
  constructor(private readonly db: SupabaseClient) {}

  async get(accountId: string): Promise<ImportProgress | null> {
    const { data, error } = await this.db
      .from("ml_import_progress")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle()

    if (error) throw new Error(`DB error reading progress: ${error.message}`)
    return data as ImportProgress | null
  }

  async getOrCreate(accountId: string): Promise<ImportProgress> {
    const existing = await this.get(accountId)
    if (existing) return existing

    const { data, error } = await this.db
      .from("ml_import_progress")
      .insert({
        account_id: accountId,
        status: "idle",
        publications_offset: 0,
        activity_since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error) throw new Error(`DB error creating progress: ${error.message}`)
    return data as ImportProgress
  }

  async update(accountId: string, fields: Partial<ImportProgress>): Promise<void> {
    const { error } = await this.db
      .from("ml_import_progress")
      .update(fields)
      .eq("account_id", accountId)

    if (error) throw new Error(`DB error updating progress: ${error.message}`)
  }

  async reset(accountId: string): Promise<void> {
    await this.update(accountId, {
      publications_offset: 0,
      publications_total: null,
      scroll_id: null,
      status: "idle",
      paused_until: null,
      last_error: null,
      last_error_at: null,
      last_run_at: null,
      ml_items_seen_count: 0,
      db_rows_upserted_count: 0,
      upsert_errors_count: 0,
      discovered_count: 0,
      fetched_count: 0,
      upsert_new_count: 0,
      request_count: 0,
      finished_at: null,
    })
  }

  async getCounters(accountId: string) {
    const { data } = await this.db
      .from("ml_import_progress")
      .select(
        "upsert_new_count, fetched_count, discovered_count, request_count, ml_items_seen_count, db_rows_upserted_count, upsert_errors_count",
      )
      .eq("account_id", accountId)
      .single()

    return data as Pick<
      ImportProgress,
      | "upsert_new_count"
      | "fetched_count"
      | "discovered_count"
      | "request_count"
      | "ml_items_seen_count"
      | "db_rows_upserted_count"
      | "upsert_errors_count"
    > | null
  }
}
