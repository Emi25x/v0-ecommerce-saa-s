/**
 * Port interfaces for ML Import Pro
 *
 * These interfaces define the contracts between the application/domain
 * layers and the infrastructure. Implementations can be swapped for
 * testing (in-memory) or different backends.
 */

import type {
  ImportProgress,
  MlAccount,
  PublicationRow,
  ScanPage,
  MlRawItem,
} from "../domain/types"

// ── MercadoLibre API Client ─────────────────────────────────────────────────

export interface IMercadoLibreClient {
  /**
   * Fetches the next page of item IDs using scroll-based pagination.
   */
  scanItems(
    userId: string,
    scrollId: string | null,
    scope: "all" | "active_only",
  ): Promise<ScanPage>

  /**
   * Fetches full item details for a batch of IDs (multiget).
   * Max 20 IDs per call (ML limit).
   */
  getItemDetails(itemIds: string[]): Promise<MlRawItem[]>

  /**
   * Refreshes the access token if expired. Returns the new token.
   */
  refreshToken(): Promise<string>
}

// ── Import Progress Repository ──────────────────────────────────────────────

export interface IImportProgressRepository {
  /**
   * Get progress for an account. Returns null if not found.
   */
  get(accountId: string): Promise<ImportProgress | null>

  /**
   * Get or create progress for an account.
   */
  getOrCreate(accountId: string): Promise<ImportProgress>

  /**
   * Partial update of progress fields.
   */
  update(accountId: string, fields: Partial<ImportProgress>): Promise<void>

  /**
   * Reset progress to initial state (preserving account_id).
   */
  reset(accountId: string): Promise<void>

  /**
   * Read specific counter fields (for increment operations mid-loop).
   */
  getCounters(accountId: string): Promise<Pick<
    ImportProgress,
    | "upsert_new_count"
    | "fetched_count"
    | "discovered_count"
    | "request_count"
    | "ml_items_seen_count"
    | "db_rows_upserted_count"
    | "upsert_errors_count"
  > | null>
}

// ── Publication Repository ──────────────────────────────────────────────────

export interface IPublicationRepository {
  /**
   * Upsert publications (insert or update on conflict).
   * Returns the count of rows actually persisted.
   */
  upsert(rows: PublicationRow[]): Promise<{ count: number; error: string | null }>

  /**
   * Count publications for an account in the database.
   */
  countByAccount(accountId: string): Promise<number>
}

// ── ML Account Repository ───────────────────────────────────────────────────

export interface IMlAccountRepository {
  /**
   * Find account by ID.
   */
  findById(accountId: string): Promise<MlAccount | null>
}

// ── Import Run Logger (process_runs audit trail) ────────────────────────────

export interface IImportRunLogger {
  /**
   * Starts a new run. Returns a handle to complete/fail it.
   */
  start(): Promise<IRunHandle>
}

export interface IRunHandle {
  complete(data: {
    rows_processed: number
    rows_updated: number
    rows_failed: number
    log_json: Record<string, unknown>
  }): Promise<void>

  fail(error: unknown): Promise<void>
}
