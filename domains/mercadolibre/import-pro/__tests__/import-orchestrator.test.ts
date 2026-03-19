import { describe, it, expect, vi, beforeEach } from "vitest"
import { ImportOrchestrator } from "../application/import-orchestrator"
import {
  AccountNotFoundError,
  ProgressNotFoundError,
  ConcurrentRunError,
  RateLimitedError,
} from "../domain/errors"
import type {
  IMercadoLibreClient,
  IImportProgressRepository,
  IPublicationRepository,
  IMlAccountRepository,
  IImportRunLogger,
} from "../infrastructure/interfaces"
import type { ImportProgress, MlAccount } from "../domain/types"

// ── Mocks ─────────────────────────────────────────────────────────────────

function mockAccount(overrides?: Partial<MlAccount>): MlAccount {
  return {
    id: "acc-123",
    ml_user_id: "12345678",
    nickname: "TestSeller",
    ...overrides,
  }
}

function mockProgress(overrides?: Partial<ImportProgress>): ImportProgress {
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

function createMockMlClient(): IMercadoLibreClient {
  return {
    scanItems: vi.fn().mockResolvedValue({ item_ids: [], scroll_id: null, total: 0 }),
    getItemDetails: vi.fn().mockResolvedValue([]),
    refreshToken: vi.fn().mockResolvedValue("new-token"),
  }
}

function createMockProgressRepo(progress?: ImportProgress): IImportProgressRepository {
  const stored = progress || mockProgress()
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

function createMockPublicationRepo(): IPublicationRepository {
  return {
    upsert: vi.fn().mockResolvedValue({ count: 0, error: null }),
    countByAccount: vi.fn().mockResolvedValue(0),
  }
}

function createMockAccountRepo(account?: MlAccount | null): IMlAccountRepository {
  return {
    findById: vi.fn().mockResolvedValue(arguments.length > 0 ? account : mockAccount()),
  }
}

function createMockRunLogger(): IImportRunLogger {
  return {
    start: vi.fn().mockResolvedValue({
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    }),
  }
}

function createOrchestrator(overrides?: {
  mlClient?: IMercadoLibreClient
  progressRepo?: IImportProgressRepository
  publicationRepo?: IPublicationRepository
  accountRepo?: IMlAccountRepository
  runLogger?: IImportRunLogger
}) {
  return new ImportOrchestrator(
    overrides?.mlClient ?? createMockMlClient(),
    overrides?.progressRepo ?? createMockProgressRepo(),
    overrides?.publicationRepo ?? createMockPublicationRepo(),
    overrides?.accountRepo ?? createMockAccountRepo(),
    overrides?.runLogger ?? createMockRunLogger(),
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("ImportOrchestrator", () => {
  describe("validatePreconditions", () => {
    it("throws AccountNotFoundError when account doesn't exist", async () => {
      const orchestrator = createOrchestrator({
        accountRepo: createMockAccountRepo(null),
      })

      await expect(orchestrator.validatePreconditions("missing-id")).rejects.toThrow(
        AccountNotFoundError,
      )
    })

    it("throws ProgressNotFoundError when progress doesn't exist", async () => {
      const progressRepo = createMockProgressRepo()
      progressRepo.get = vi.fn().mockResolvedValue(null)

      const orchestrator = createOrchestrator({ progressRepo })

      await expect(orchestrator.validatePreconditions("acc-123")).rejects.toThrow(
        ProgressNotFoundError,
      )
    })

    it("throws ConcurrentRunError when another run is recent", async () => {
      const progressRepo = createMockProgressRepo(
        mockProgress({
          status: "running",
          last_run_at: new Date().toISOString(),
        }),
      )

      const orchestrator = createOrchestrator({ progressRepo })

      await expect(orchestrator.validatePreconditions("acc-123")).rejects.toThrow(
        ConcurrentRunError,
      )
    })

    it("allows run when previous run is stale (>90s)", async () => {
      const staleTime = new Date(Date.now() - 100_000).toISOString()
      const progressRepo = createMockProgressRepo(
        mockProgress({
          status: "running",
          last_run_at: staleTime,
        }),
      )

      const orchestrator = createOrchestrator({ progressRepo })
      const result = await orchestrator.validatePreconditions("acc-123")

      expect(result.account.id).toBe("acc-123")
    })

    it("throws RateLimitedError when pause hasn't expired", async () => {
      const future = new Date(Date.now() + 30_000).toISOString()
      const progressRepo = createMockProgressRepo(
        mockProgress({
          status: "paused",
          paused_until: future,
        }),
      )

      const orchestrator = createOrchestrator({ progressRepo })

      await expect(orchestrator.validatePreconditions("acc-123")).rejects.toThrow(
        RateLimitedError,
      )
    })

    it("unlocks expired pause and returns success", async () => {
      const past = new Date(Date.now() - 10_000).toISOString()
      const progressRepo = createMockProgressRepo(
        mockProgress({
          status: "paused",
          paused_until: past,
        }),
      )

      const orchestrator = createOrchestrator({ progressRepo })
      const result = await orchestrator.validatePreconditions("acc-123")

      expect(result.account.id).toBe("acc-123")
      expect(progressRepo.update).toHaveBeenCalledWith("acc-123", {
        status: "idle",
        paused_until: null,
      })
    })
  })

  describe("getStatus", () => {
    it("returns status with publications count from DB", async () => {
      const publicationRepo = createMockPublicationRepo()
      publicationRepo.countByAccount = vi.fn().mockResolvedValue(42)

      const orchestrator = createOrchestrator({ publicationRepo })
      const result = await orchestrator.getStatus("acc-123")

      expect(result.ok).toBe(true)
      expect(result.account.nickname).toBe("TestSeller")
      expect(result.progress.publications_in_db).toBe(42)
    })

    it("throws AccountNotFoundError for missing account", async () => {
      const orchestrator = createOrchestrator({
        accountRepo: createMockAccountRepo(null),
      })

      await expect(orchestrator.getStatus("missing")).rejects.toThrow(AccountNotFoundError)
    })

    it("creates progress if not exists", async () => {
      const progressRepo = createMockProgressRepo()
      const orchestrator = createOrchestrator({ progressRepo })
      await orchestrator.getStatus("acc-123")

      expect(progressRepo.getOrCreate).toHaveBeenCalledWith("acc-123")
    })
  })

  describe("resetProgress", () => {
    it("resets progress for existing account", async () => {
      const progressRepo = createMockProgressRepo()
      const orchestrator = createOrchestrator({ progressRepo })

      await orchestrator.resetProgress("acc-123")
      expect(progressRepo.reset).toHaveBeenCalledWith("acc-123")
    })

    it("throws AccountNotFoundError for missing account", async () => {
      const orchestrator = createOrchestrator({
        accountRepo: createMockAccountRepo(null),
      })

      await expect(orchestrator.resetProgress("missing")).rejects.toThrow(AccountNotFoundError)
    })
  })

  describe("run", () => {
    it("marks progress as running at start", async () => {
      const progressRepo = createMockProgressRepo()
      const orchestrator = createOrchestrator({ progressRepo })

      await orchestrator.run(mockAccount(), mockProgress(), {
        account_id: "acc-123",
        max_seconds: 1,
      })

      expect(progressRepo.update).toHaveBeenCalledWith(
        "acc-123",
        expect.objectContaining({ status: "running" }),
      )
    })

    it("starts audit trail via run logger", async () => {
      const runLogger = createMockRunLogger()
      const orchestrator = createOrchestrator({ runLogger })

      await orchestrator.run(mockAccount(), mockProgress(), {
        account_id: "acc-123",
        max_seconds: 1,
      })

      expect(runLogger.start).toHaveBeenCalled()
    })

    it("returns result with ok=true even when no items found", async () => {
      const orchestrator = createOrchestrator()

      const result = await orchestrator.run(mockAccount(), mockProgress(), {
        account_id: "acc-123",
        max_seconds: 1,
      })

      expect(result.ok).toBe(true)
      expect(result.imported_count).toBe(0)
    })

    it("processes items from scan through to upsert", async () => {
      const mlClient = createMockMlClient()
      let scanCallCount = 0
      mlClient.scanItems = vi.fn().mockImplementation(() => {
        scanCallCount++
        if (scanCallCount === 1) {
          return Promise.resolve({
            item_ids: ["MLA001", "MLA002"],
            scroll_id: "scroll-1",
            total: 2,
          })
        }
        // Second call: empty (scan complete)
        return Promise.resolve({ item_ids: [], scroll_id: null, total: 2 })
      })

      mlClient.getItemDetails = vi.fn().mockResolvedValue([
        {
          code: 200,
          body: {
            id: "MLA001",
            title: "Product 1",
            price: 100,
            available_quantity: 5,
            sold_quantity: 0,
            status: "active",
            permalink: "https://example.com/1",
            listing_type_id: null,
            thumbnail: null,
            seller_custom_field: null,
            attributes: [],
            variations: [],
            shipping: null,
            tags: [],
            catalog_listing: false,
            catalog_listing_eligible: false,
          },
        },
      ])

      const publicationRepo = createMockPublicationRepo()
      publicationRepo.upsert = vi.fn().mockResolvedValue({ count: 1, error: null })

      const progressRepo = createMockProgressRepo()

      const orchestrator = createOrchestrator({
        mlClient,
        publicationRepo,
        progressRepo,
      })

      const result = await orchestrator.run(mockAccount(), mockProgress(), {
        account_id: "acc-123",
        max_seconds: 5,
      })

      expect(result.imported_count).toBe(1)
      expect(publicationRepo.upsert).toHaveBeenCalled()
    })
  })
})
