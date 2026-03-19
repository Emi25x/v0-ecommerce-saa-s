/**
 * MercadoLibre API Client Implementation
 *
 * Handles HTTP communication with ML API including:
 * - Scroll-based pagination (search_type=scan)
 * - Multiget item details
 * - Retry with exponential backoff
 * - Token refresh on 401
 */

import { getValidAccessToken } from "@/lib/mercadolibre"
import type { IMercadoLibreClient } from "./interfaces"
import type { ScanPage, MlRawItem } from "../domain/types"
import { ML_SCAN_PAGE_SIZE, ML_ATTRIBUTES } from "../domain/types"

const FETCH_TIMEOUT_MS = 12_000
const MAX_RETRIES = 3

export class MercadoLibreClient implements IMercadoLibreClient {
  private accessToken: string
  private readonly accountId: string

  constructor(accountId: string, accessToken: string) {
    this.accountId = accountId
    this.accessToken = accessToken
  }

  /**
   * Factory that resolves a valid access token automatically.
   */
  static async create(accountId: string): Promise<MercadoLibreClient> {
    const token = await getValidAccessToken(accountId)
    return new MercadoLibreClient(accountId, token)
  }

  async refreshToken(): Promise<string> {
    this.accessToken = await getValidAccessToken(this.accountId)
    return this.accessToken
  }

  async scanItems(
    userId: string,
    scrollId: string | null,
    scope: "all" | "active_only",
  ): Promise<ScanPage> {
    const url = scrollId
      ? `https://api.mercadolibre.com/users/${userId}/items/search?search_type=scan&scroll_id=${scrollId}`
      : `https://api.mercadolibre.com/users/${userId}/items/search?search_type=scan&limit=${ML_SCAN_PAGE_SIZE}${scope === "active_only" ? "&status=active" : ""}`

    const { res, rateLimited, retryAfter } = await this.fetchWithRetry(url)

    if (rateLimited) {
      return { item_ids: [], scroll_id: scrollId, total: 0 }
    }

    if (!res || !res.ok) {
      const status = res?.status ?? 0
      // 401 → try token refresh
      if (status === 401) {
        await this.refreshToken()
        // Retry once with new token
        const retry = await this.fetchWithRetry(url)
        if (retry.res?.ok) {
          const data = await retry.res.json()
          return {
            item_ids: data.results || [],
            scroll_id: data.scroll_id || null,
            total: data.paging?.total || 0,
          }
        }
      }
      const body = res ? await res.text().catch(() => "") : "no response"
      throw new MlHttpError(status, body, url)
    }

    const data = await res.json()
    return {
      item_ids: data.results || [],
      scroll_id: data.scroll_id || null,
      total: data.paging?.total || 0,
    }
  }

  async getItemDetails(itemIds: string[]): Promise<MlRawItem[]> {
    const idsParam = itemIds.join(",")
    const url = `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=${ML_ATTRIBUTES}`

    const { res, rateLimited } = await this.fetchWithRetry(url)

    if (rateLimited) return []
    if (!res || !res.ok) return []

    const data = await res.json()
    return Array.isArray(data) ? data : []
  }

  // ── Internal: fetch with retry + backoff ──────────────────────────────────

  private async fetchWithRetry(
    url: string,
  ): Promise<{ res: Response | null; rateLimited: boolean; retryAfter: number }> {
    let attempt = 0

    while (attempt < MAX_RETRIES) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${this.accessToken}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })

        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get("retry-after") || "60")
          return { res, rateLimited: true, retryAfter }
        }

        if (res.status >= 500 && attempt < MAX_RETRIES - 1) {
          await this.backoff(attempt)
          attempt++
          continue
        }

        return { res, rateLimited: false, retryAfter: 0 }
      } catch {
        if (attempt < MAX_RETRIES - 1) {
          await this.backoff(attempt)
          attempt++
          continue
        }
        return { res: null, rateLimited: false, retryAfter: 0 }
      }
    }

    return { res: null, rateLimited: false, retryAfter: 0 }
  }

  private backoff(attempt: number): Promise<void> {
    const ms = 300 * 2 ** attempt // 300ms, 600ms, 1200ms
    return new Promise((r) => setTimeout(r, ms))
  }
}

/**
 * Structured HTTP error from ML API.
 */
class MlHttpError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string, url: string) {
    super(`ML API HTTP ${status}: ${body.slice(0, 200)} (${url.slice(0, 80)})`)
    this.name = "MlHttpError"
    this.status = status
    this.body = body
  }
}
