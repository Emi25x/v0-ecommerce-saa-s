/**
 * Tests for MercadoLibreClient — retry/backoff, rate limiting, error handling.
 *
 * We test the public methods (scanItems, getItemDetails) which internally use fetchWithRetry.
 * Global `fetch` is mocked to control HTTP responses without network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { MercadoLibreClient } from "@/domains/mercadolibre/import-pro/infrastructure/ml-client"

// Mock getValidAccessToken to avoid real Supabase calls
vi.mock("@/lib/mercadolibre", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("refreshed-token"),
}))

// ── Helpers ──

function okScanResponse(itemIds: string[], scrollId: string | null, total: number) {
  return new Response(
    JSON.stringify({
      results: itemIds,
      scroll_id: scrollId,
      paging: { total },
    }),
    { status: 200 },
  )
}

function okMultigetResponse(items: Array<{ id: string }>) {
  return new Response(
    JSON.stringify(items.map((item) => ({ code: 200, body: item }))),
    { status: 200 },
  )
}

function errorResponse(status: number, body = "error") {
  return new Response(body, { status })
}

function rateLimitResponse(retryAfter = "60") {
  return new Response("rate limited", {
    status: 429,
    headers: { "retry-after": retryAfter },
  })
}

// ── Tests ──

describe("MercadoLibreClient", () => {
  let client: MercadoLibreClient
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    client = new MercadoLibreClient("acc-123", "test-token")
    fetchSpy = vi.spyOn(globalThis, "fetch")
    // Fast-forward backoff timers
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe("scanItems", () => {
    it("returns items from a successful scan", async () => {
      fetchSpy.mockResolvedValueOnce(okScanResponse(["MLA001", "MLA002"], "scroll-1", 100))

      const result = await client.scanItems("12345", null, "all")

      expect(result.item_ids).toEqual(["MLA001", "MLA002"])
      expect(result.scroll_id).toBe("scroll-1")
      expect(result.total).toBe(100)
    })

    it("passes scroll_id for pagination", async () => {
      fetchSpy.mockResolvedValueOnce(okScanResponse(["MLA003"], "scroll-2", 100))

      await client.scanItems("12345", "scroll-1", "all")

      const calledUrl = fetchSpy.mock.calls[0]?.[0] as string
      expect(calledUrl).toContain("scroll_id=scroll-1")
    })

    it("filters by active_only scope", async () => {
      fetchSpy.mockResolvedValueOnce(okScanResponse([], null, 0))

      await client.scanItems("12345", null, "active_only")

      const calledUrl = fetchSpy.mock.calls[0]?.[0] as string
      expect(calledUrl).toContain("status=active")
    })

    it("returns empty page on 429 rate limit", async () => {
      fetchSpy.mockResolvedValueOnce(rateLimitResponse("30"))

      const result = await client.scanItems("12345", "scroll-1", "all")

      expect(result.item_ids).toEqual([])
      // Preserves current scroll_id so client can retry later
      expect(result.scroll_id).toBe("scroll-1")
    })

    it("retries on 401 with refreshed token", async () => {
      fetchSpy
        .mockResolvedValueOnce(errorResponse(401))
        .mockResolvedValueOnce(okScanResponse(["MLA001"], "scroll-1", 1))

      const result = await client.scanItems("12345", null, "all")

      expect(result.item_ids).toEqual(["MLA001"])
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it("sends Authorization header", async () => {
      fetchSpy.mockResolvedValueOnce(okScanResponse([], null, 0))

      await client.scanItems("12345", null, "all")

      const callArgs = fetchSpy.mock.calls[0]?.[1] as RequestInit
      expect(callArgs.headers).toEqual({ Authorization: "Bearer test-token" })
    })
  })

  describe("getItemDetails", () => {
    it("returns items from multiget", async () => {
      const items = [{ id: "MLA001" }, { id: "MLA002" }]
      fetchSpy.mockResolvedValueOnce(okMultigetResponse(items))

      const result = await client.getItemDetails(["MLA001", "MLA002"])

      expect(result).toHaveLength(2)
    })

    it("joins ids with comma in URL", async () => {
      fetchSpy.mockResolvedValueOnce(okMultigetResponse([]))

      await client.getItemDetails(["MLA001", "MLA002", "MLA003"])

      const calledUrl = fetchSpy.mock.calls[0]?.[0] as string
      expect(calledUrl).toContain("ids=MLA001,MLA002,MLA003")
    })

    it("returns empty array on 429", async () => {
      fetchSpy.mockResolvedValueOnce(rateLimitResponse())

      const result = await client.getItemDetails(["MLA001"])

      expect(result).toEqual([])
    })

    it("returns empty array on non-ok response after retries", async () => {
      // 500s trigger retry — need 3 failures to exhaust retries
      fetchSpy
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(errorResponse(500))

      const result = await client.getItemDetails(["MLA001"])

      expect(result).toEqual([])
    }, 15_000)
  })

  describe("retry with backoff", () => {
    it("retries on 500 errors up to 3 times", async () => {
      fetchSpy
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(errorResponse(502))
        .mockResolvedValueOnce(okScanResponse(["MLA001"], null, 1))

      const result = await client.scanItems("12345", null, "all")

      expect(result.item_ids).toEqual(["MLA001"])
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it("gives up after 3 failed attempts and throws", async () => {
      fetchSpy
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(errorResponse(500))

      // scanItems throws MlHttpError on final failure
      await expect(client.scanItems("12345", null, "all")).rejects.toThrow("ML API HTTP 500")
    })

    it("retries on network errors (fetch throws)", async () => {
      fetchSpy
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockRejectedValueOnce(new Error("ETIMEDOUT"))
        .mockResolvedValueOnce(okScanResponse(["MLA001"], null, 1))

      const result = await client.scanItems("12345", null, "all")

      expect(result.item_ids).toEqual(["MLA001"])
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it("returns null response after exhausting retries on network errors", async () => {
      fetchSpy
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockRejectedValueOnce(new Error("ECONNRESET"))

      // getItemDetails returns [] on null response (graceful)
      const result = await client.getItemDetails(["MLA001"])
      expect(result).toEqual([])
    })
  })

  describe("refreshToken", () => {
    it("updates internal token", async () => {
      const newToken = await client.refreshToken()

      expect(newToken).toBe("refreshed-token")

      // Next request should use the new token
      fetchSpy.mockResolvedValueOnce(okScanResponse([], null, 0))
      await client.scanItems("12345", null, "all")

      const callArgs = fetchSpy.mock.calls[0]?.[1] as RequestInit
      expect(callArgs.headers).toEqual({ Authorization: "Bearer refreshed-token" })
    })
  })
})
