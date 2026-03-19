/**
 * Request parsing and validation for Import Pro endpoints.
 *
 * Extracts, validates, and normalizes input from HTTP requests.
 * Returns typed domain objects or throws ValidationError.
 */

import { ValidationError } from "../domain/errors"
import type { ImportRunInput } from "../domain/types"
import { ML_MULTIGET_MAX_IDS } from "../domain/types"

/**
 * Parses and validates the POST body for /api/ml/import-pro/run
 */
export function parseRunRequest(body: unknown): ImportRunInput {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body is required")
  }

  const b = body as Record<string, unknown>

  const accountId = b.account_id
  if (!accountId || typeof accountId !== "string") {
    throw new ValidationError("account_id is required", "account_id")
  }

  const maxSeconds = typeof b.max_seconds === "number" ? b.max_seconds : 12
  const detailBatch = Math.min(
    ML_MULTIGET_MAX_IDS,
    Math.max(1, typeof b.detail_batch === "number" ? b.detail_batch : ML_MULTIGET_MAX_IDS),
  )
  const concurrency = typeof b.concurrency === "number" ? b.concurrency : 2

  return {
    account_id: accountId,
    max_seconds: maxSeconds,
    detail_batch: detailBatch,
    concurrency,
  }
}

/**
 * Parses account_id from query string (for GET endpoints like /status)
 */
export function parseAccountIdFromQuery(searchParams: URLSearchParams): string {
  const accountId = searchParams.get("account_id")
  if (!accountId) {
    throw new ValidationError("account_id query parameter is required", "account_id")
  }
  return accountId
}

/**
 * Parses account_id from POST body (for /reset)
 */
export function parseAccountIdFromBody(body: unknown): string {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body is required")
  }

  const b = body as Record<string, unknown>
  const accountId = b.account_id
  if (!accountId || typeof accountId !== "string") {
    throw new ValidationError("account_id is required", "account_id")
  }

  return accountId
}
