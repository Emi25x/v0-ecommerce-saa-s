/**
 * MercadoLibre API Client Implementation
 *
 * Handles HTTP communication with ML API including:
 * - Scroll-based pagination (search_type=scan)
 * - Multiget item details
 * - Retry with exponential backoff
 * - Token refresh on 401
 * - Structured logging with timing
 *
 * SECURITY: Never log access tokens.
 */

import { getValidAccessToken } from "@/lib/mercadolibre"
import type { IMercadoLibreClient } from "./interfaces"
import type { ScanPage, MlRawItem } from "../domain/types"
import { ML_SCAN_PAGE_SIZE, ML_ATTRIBUTES } from "../domain/types"
import type { StructuredLogger } from "@/lib/logger"

const FETCH_TIMEOUT_MS = 12_000
const MAX_RETRIES = 3

export class MercadoLibreClient implements IMercadoLibreClient {
  private accessToken: string
  private readonly accountId: string
  private readonly log?: StructuredLogger

  constructor(accountId: string, accessToken: string, log?: StructuredLogger) {
    this.accountId = accountId
    this.accessToken = accessToken
    this.log = log
  }

  /**
   * Factory that resolves a valid access token automatically.
   */
  static async create(accountId: string, log?: StructuredLogger): Promise<MercadoLibreClient> {
    const token = await getValidAccessToken(accountId)
    return new MercadoLibreClient(accountId, token, log)
  }

  async refreshToken(): Promise<string> {
    const t0 = performance.now()
    this.accessToken = await getValidAccessToken(this.accountId)
    this.log?.info("Token refreshed", "ml.refresh_token", {
      duration_ms: Math.round(performance.now() - t0),
      status: "ok",
    })
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

    const t0 = performance.now()
    const { res, rateLimited, retryAfter } = await this.fetchWithRetry(url)
    const duration_ms = Math.round(performance.now() - t0)

    if (rateLimited) {
      this.log?.warn("Rate limited by ML API", "ml.scan", {
        duration_ms,
        status: "rate_limited",
        retry_after_s: retryAfter,
      })
      return { item_ids: [], scroll_id: scrollId, total: 0 }
    }

    if (!res || !res.ok) {
      const status = res?.status ?? 0
      // 401 → try token refresh
      if (status === 401) {
        this.log?.warn("Token expired, refreshing", "ml.scan", { http_status: 401 })
        await this.refreshToken()
        // Retry once with new token
        const retry = await this.fetchWithRetry(url)
        if (retry.res?.ok) {
          const data = await retry.res.json()
          const totalDuration = Math.round(performance.now() - t0)
          this.log?.info("Scan completed after token refresh", "ml.scan", {
            duration_ms: totalDuration,
            status: "ok",
            items_count: data.results?.length ?? 0,
            total: data.paging?.total ?? 0,
          })
          return {
            item_ids: data.results || [],
            scroll_id: data.scroll_id || null,
            total: data.paging?.total || 0,
          }
        }
      }
      const body = res ? await res.text().catch(() => "") : "no response"
      this.log?.error("Scan request failed", new MlHttpError(status, body, url), "ml.scan", {
        duration_ms,
        http_status: status,
      })
      throw new MlHttpError(status, body, url)
    }

    const data = await res.json()
    const itemIds = data.results || []

    this.log?.info("Scan page fetched", "ml.scan", {
      duration_ms,
      status: "ok",
      items_count: itemIds.length,
      total: data.paging?.total ?? 0,
      has_scroll: !!data.scroll_id,
    })

    return {
      item_ids: itemIds,
      scroll_id: data.scroll_id || null,
      total: data.paging?.total || 0,
    }
  }

  async getItemDetails(itemIds: string[]): Promise<MlRawItem[]> {
    const idsParam = itemIds.join(",")
    const url = `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=${ML_ATTRIBUTES}`

    const t0 = performance.now()
    const { res, rateLimited } = await this.fetchWithRetry(url)
    const duration_ms = Math.round(performance.now() - t0)

    if (rateLimited) {
      this.log?.warn("Rate limited on multiget", "ml.multiget", {
        duration_ms,
        status: "rate_limited",
        batch_size: itemIds.length,
      })
      return []
    }

    if (!res || !res.ok) {
      this.log?.warn("Multiget request failed", "ml.multiget", {
        duration_ms,
        status: "error",
        http_status: res?.status ?? 0,
        batch_size: itemIds.length,
      })
      return []
    }

    const data = await res.json()
    const items = Array.isArray(data) ? data : []

    this.log?.info("Multiget fetched", "ml.multiget", {
      duration_ms,
      status: "ok",
      requested: itemIds.length,
      returned: items.length,
    })

    return items
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
          this.log?.warn(`ML API 5xx, retrying (attempt ${attempt + 1})`, "ml.http", {
            http_status: res.status,
            attempt: attempt + 1,
          })
          await this.backoff(attempt)
          attempt++
          continue
        }

        return { res, rateLimited: false, retryAfter: 0 }
      } catch (err) {
        if (attempt < MAX_RETRIES - 1) {
          this.log?.warn(`Fetch failed, retrying (attempt ${attempt + 1})`, "ml.http", {
            error_code: err instanceof Error && err.name === "AbortError" ? "timeout" : "network",
            attempt: attempt + 1,
          })
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
  readonly code: string

  constructor(status: number, body: string, url: string) {
    // Strip token from URL for safety
    const safeUrl = url.replace(/access_token=[^&]+/, "access_token=***")
    super(`ML API HTTP ${status}: ${body.slice(0, 200)} (${safeUrl.slice(0, 80)})`)
    this.name = "MlHttpError"
    this.status = status
    this.body = body
    this.code = `ml_http_${status}`
  }
}
