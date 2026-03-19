/**
 * Shared mock factories for ML Import Pro tests.
 *
 * Re-exports well-typed factories that can be used in both __tests__/ and tests/.
 */

import { vi } from "vitest"
import type {
  IMercadoLibreClient,
  IImportProgressRepository,
  IPublicationRepository,
  IMlAccountRepository,
  IImportRunLogger,
} from "@/domains/mercadolibre/import-pro/infrastructure/interfaces"
import type { ImportProgress, MlAccount, MlRawItem } from "@/domains/mercadolibre/import-pro/domain/types"

// ── Data factories ──

export function mockAccount(overrides?: Partial<MlAccount>): MlAccount {
  return {
    id: "acc-123",
    ml_user_id: "12345678",
    nickname: "TestSeller",
    ...overrides,
  }
}

export function mockProgress(overrides?: Partial<ImportProgress>): ImportProgress {
  return {
    account_id: "acc-123",
    status: "idle",
    publications_offset: 0,
    publications_total: null,
    publications_scope: "all",
    activity_since: "2026-02-17T00:00:00.000Z",
    scroll_id: null,
    paused_until: null,
    last_error: null,
    last_error_at: null,
    last_run_at: null,
    finished_at: null,
    ml_items_seen_count: 0,
    db_rows_upserted_count: 0,
    upsert_errors_count: 0,
    discovered_count: 0,
    fetched_count: 0,
    upsert_new_count: 0,
    request_count: 0,
    last_sync_batch_at: null,
    ...overrides,
  }
}

export function mockMlItem(overrides?: Partial<MlRawItem["body"]> & { code?: number }): MlRawItem {
  const { code = 200, ...bodyOverrides } = overrides ?? {}
  return {
    code,
    body: {
      id: "MLA001",
      title: "Test Product",
      price: 100,
      available_quantity: 5,
      sold_quantity: 0,
      status: "active",
      permalink: "https://articulo.mercadolibre.com.ar/MLA001",
      listing_type_id: "gold_special",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_001.jpg",
      seller_custom_field: null,
      attributes: [],
      variations: [],
      shipping: null,
      tags: [],
      catalog_listing: false,
      catalog_listing_eligible: false,
      ...bodyOverrides,
    },
  }
}

// ── Repo / client mock factories ──

export function createMockMlClient(): IMercadoLibreClient {
  return {
    scanItems: vi.fn().mockResolvedValue({ item_ids: [], scroll_id: null, total: 0 }),
    getItemDetails: vi.fn().mockResolvedValue([]),
    refreshToken: vi.fn().mockResolvedValue("new-token"),
  }
}

export function createMockProgressRepo(progress?: ImportProgress): IImportProgressRepository {
  const stored = progress ?? mockProgress()
  return {
    get: vi.fn().mockResolvedValue(stored),
    getOrCreate: vi.fn().mockResolvedValue(stored),
    update: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    getCounters: vi.fn().mockResolvedValue({
      upsert_new_count: 0,
      fetched_count: 0,
      discovered_count: 0,
      request_count: 0,
      ml_items_seen_count: 0,
      db_rows_upserted_count: 0,
      upsert_errors_count: 0,
    }),
  }
}

export function createMockPublicationRepo(): IPublicationRepository {
  return {
    upsert: vi.fn().mockResolvedValue({ count: 0, error: null }),
    countByAccount: vi.fn().mockResolvedValue(0),
  }
}

export function createMockAccountRepo(account?: MlAccount | null): IMlAccountRepository {
  return {
    findById: vi.fn().mockResolvedValue(account === undefined ? mockAccount() : account),
  }
}

export function createMockRunLogger(): IImportRunLogger {
  return {
    start: vi.fn().mockResolvedValue({
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    }),
  }
}

// ── HTTP response helpers (for testing MercadoLibreClient) ──

export function mockFetchResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response
}
