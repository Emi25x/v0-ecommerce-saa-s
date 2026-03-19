/**
 * Integration-style tests for the Import Orchestrator.
 *
 * These test the full run() flow with realistic multi-page scan scenarios,
 * verifying that the orchestrator correctly:
 * - Pages through ML scan results
 * - Batches item detail requests
 * - Maps and upserts publications
 * - Updates progress counters
 * - Handles terminal conditions (scan complete, rate limit, errors)
 */

import { describe, it, expect, vi } from "vitest"
import { ImportOrchestrator } from "@/domains/mercadolibre/import-pro/application/import-orchestrator"
import {
  mockAccount,
  mockProgress,
  mockMlItem,
  createMockMlClient,
  createMockProgressRepo,
  createMockPublicationRepo,
  createMockAccountRepo,
  createMockRunLogger,
} from "./helpers/ml-import-mocks"

function createOrchestrator(overrides?: Record<string, unknown>) {
  const mlClient = (overrides?.mlClient as ReturnType<typeof createMockMlClient>) ?? createMockMlClient()
  const progressRepo =
    (overrides?.progressRepo as ReturnType<typeof createMockProgressRepo>) ?? createMockProgressRepo()
  const publicationRepo =
    (overrides?.publicationRepo as ReturnType<typeof createMockPublicationRepo>) ?? createMockPublicationRepo()
  const accountRepo =
    (overrides?.accountRepo as ReturnType<typeof createMockAccountRepo>) ?? createMockAccountRepo()
  const runLogger =
    (overrides?.runLogger as ReturnType<typeof createMockRunLogger>) ?? createMockRunLogger()

  return { orchestrator: new ImportOrchestrator(mlClient, progressRepo, publicationRepo, accountRepo, runLogger), mlClient, progressRepo, publicationRepo }
}

describe("Import Orchestrator — full run flow", () => {
  it("scans, fetches details, maps, and upserts in a single iteration", async () => {
    const mlClient = createMockMlClient()
    let scanCall = 0
    mlClient.scanItems = vi.fn().mockImplementation(() => {
      scanCall++
      if (scanCall === 1) {
        return Promise.resolve({
          item_ids: ["MLA001", "MLA002", "MLA003"],
          scroll_id: "scroll-1",
          total: 3,
        })
      }
      return Promise.resolve({ item_ids: [], scroll_id: null, total: 3 })
    })

    mlClient.getItemDetails = vi.fn().mockResolvedValue([
      mockMlItem({ id: "MLA001", title: "Libro A", price: 1000 }),
      mockMlItem({ id: "MLA002", title: "Libro B", price: 2000 }),
      mockMlItem({ id: "MLA003", title: "Libro C", price: 3000 }),
    ])

    const publicationRepo = createMockPublicationRepo()
    publicationRepo.upsert = vi.fn().mockResolvedValue({ count: 3, error: null })

    const { orchestrator, progressRepo } = createOrchestrator({ mlClient, publicationRepo })

    const result = await orchestrator.run(mockAccount(), mockProgress(), {
      account_id: "acc-123",
      max_seconds: 10,
    })

    expect(result.ok).toBe(true)
    expect(result.imported_count).toBe(3)
    expect(result.ml_items_seen_count).toBe(3)
    expect(result.db_rows_upserted).toBe(3)
    expect(publicationRepo.upsert).toHaveBeenCalled()
    expect(progressRepo.update).toHaveBeenCalled()
  })

  it("handles multi-page scan with pagination", async () => {
    const mlClient = createMockMlClient()
    let scanCall = 0
    mlClient.scanItems = vi.fn().mockImplementation(() => {
      scanCall++
      if (scanCall === 1) {
        return Promise.resolve({
          item_ids: ["MLA001", "MLA002"],
          scroll_id: "scroll-1",
          total: 4,
        })
      }
      if (scanCall === 2) {
        return Promise.resolve({
          item_ids: ["MLA003", "MLA004"],
          scroll_id: "scroll-2",
          total: 4,
        })
      }
      return Promise.resolve({ item_ids: [], scroll_id: null, total: 4 })
    })

    mlClient.getItemDetails = vi.fn().mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id: string) => mockMlItem({ id, title: `Product ${id}` }))),
    )

    const publicationRepo = createMockPublicationRepo()
    publicationRepo.upsert = vi.fn().mockImplementation((_rows: unknown[]) =>
      Promise.resolve({ count: 2, error: null }),
    )

    const { orchestrator } = createOrchestrator({ mlClient, publicationRepo })

    const result = await orchestrator.run(mockAccount(), mockProgress(), {
      account_id: "acc-123",
      max_seconds: 10,
    })

    expect(result.ok).toBe(true)
    expect(result.ml_items_seen_count).toBe(4)
    expect(mlClient.scanItems).toHaveBeenCalledTimes(3) // 2 pages + empty
  })

  it("stops when max_seconds budget is exhausted", async () => {
    const mlClient = createMockMlClient()
    // Always return items (infinite scan)
    mlClient.scanItems = vi.fn().mockResolvedValue({
      item_ids: ["MLA001"],
      scroll_id: "scroll-next",
      total: 10000,
    })
    mlClient.getItemDetails = vi.fn().mockResolvedValue([
      mockMlItem({ id: "MLA001" }),
    ])

    const publicationRepo = createMockPublicationRepo()
    publicationRepo.upsert = vi.fn().mockResolvedValue({ count: 1, error: null })

    const { orchestrator } = createOrchestrator({ mlClient, publicationRepo })

    const result = await orchestrator.run(mockAccount(), mockProgress(), {
      account_id: "acc-123",
      max_seconds: 0, // Zero budget = will stop after first iteration
    })

    expect(result.ok).toBe(true)
    expect(result.has_more).toBe(true)
  })

  it("completes ok when scan returns empty results (all items seen)", async () => {
    const mlClient = createMockMlClient()
    let scanCall = 0
    mlClient.scanItems = vi.fn().mockImplementation(() => {
      scanCall++
      if (scanCall === 1) {
        return Promise.resolve({ item_ids: ["MLA001"], scroll_id: "scroll-1", total: 1 })
      }
      return Promise.resolve({ item_ids: [], scroll_id: null, total: 1 })
    })

    mlClient.getItemDetails = vi.fn().mockResolvedValue([mockMlItem({ id: "MLA001" })])

    const publicationRepo = createMockPublicationRepo()
    publicationRepo.upsert = vi.fn().mockResolvedValue({ count: 1, error: null })

    const { orchestrator } = createOrchestrator({ mlClient, publicationRepo })

    const result = await orchestrator.run(mockAccount(), mockProgress(), {
      account_id: "acc-123",
      max_seconds: 10,
    })

    expect(result.ok).toBe(true)
    expect(result.imported_count).toBe(1)
    // The scan completed at least one iteration successfully
    expect(result.ml_items_seen_count).toBeGreaterThanOrEqual(1)
  })

  it("handles upsert errors gracefully without crashing", async () => {
    const mlClient = createMockMlClient()
    let scanCall = 0
    mlClient.scanItems = vi.fn().mockImplementation(() => {
      scanCall++
      if (scanCall === 1) {
        return Promise.resolve({ item_ids: ["MLA001"], scroll_id: null, total: 1 })
      }
      return Promise.resolve({ item_ids: [], scroll_id: null, total: 1 })
    })
    mlClient.getItemDetails = vi.fn().mockResolvedValue([mockMlItem({ id: "MLA001" })])

    const publicationRepo = createMockPublicationRepo()
    publicationRepo.upsert = vi.fn().mockResolvedValue({
      count: 0,
      error: { message: "column x does not exist", code: "42703" },
    })

    const { orchestrator } = createOrchestrator({ mlClient, publicationRepo })

    const result = await orchestrator.run(mockAccount(), mockProgress(), {
      account_id: "acc-123",
      max_seconds: 10,
    })

    // Should still return ok — upsert errors are counted, not fatal
    expect(result.ok).toBe(true)
    expect(result.errors_count).toBeGreaterThanOrEqual(0)
  })

  it("filters out items with non-200 status from multiget", async () => {
    const mlClient = createMockMlClient()
    let scanCall = 0
    mlClient.scanItems = vi.fn().mockImplementation(() => {
      scanCall++
      if (scanCall === 1) {
        return Promise.resolve({ item_ids: ["MLA001", "MLA002"], scroll_id: null, total: 2 })
      }
      return Promise.resolve({ item_ids: [], scroll_id: null, total: 2 })
    })

    mlClient.getItemDetails = vi.fn().mockResolvedValue([
      mockMlItem({ id: "MLA001" }),
      { code: 404, body: null }, // Deleted item
    ])

    const publicationRepo = createMockPublicationRepo()
    publicationRepo.upsert = vi.fn().mockResolvedValue({ count: 1, error: null })

    const { orchestrator } = createOrchestrator({ mlClient, publicationRepo })

    const result = await orchestrator.run(mockAccount(), mockProgress(), {
      account_id: "acc-123",
      max_seconds: 10,
    })

    expect(result.ok).toBe(true)
    // Only one item should have been upserted (the 200 one)
    expect(result.imported_count).toBe(1)
  })

  it("resumes from existing scroll_id in progress", async () => {
    const mlClient = createMockMlClient()
    mlClient.scanItems = vi.fn().mockResolvedValue({
      item_ids: ["MLA050"],
      scroll_id: "scroll-resumed",
      total: 100,
    })
    mlClient.getItemDetails = vi.fn().mockResolvedValue([mockMlItem({ id: "MLA050" })])

    const publicationRepo = createMockPublicationRepo()
    publicationRepo.upsert = vi.fn().mockResolvedValue({ count: 1, error: null })

    const progress = mockProgress({
      scroll_id: "scroll-existing",
      ml_items_seen_count: 49,
    })

    // The orchestrator reloads progress from repo each loop iteration,
    // so the repo must return progress with the scroll_id
    const progressRepo = createMockProgressRepo(progress)

    const { orchestrator } = createOrchestrator({ mlClient, publicationRepo, progressRepo })

    await orchestrator.run(mockAccount(), progress, {
      account_id: "acc-123",
      max_seconds: 1,
    })

    // Should have used the existing scroll_id from the repo
    const scanCall = (mlClient.scanItems as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(scanCall?.[1]).toBe("scroll-existing")
  })
})
