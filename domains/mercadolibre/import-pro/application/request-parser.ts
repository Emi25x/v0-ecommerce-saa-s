/**
 * Request parsing and validation for Import Pro endpoints.
 *
 * Uses Zod schemas for strict input validation.
 * Returns typed domain objects or throws ValidationError.
 */

import { ImportRunSchema, AccountIdBodySchema, AccountIdQuerySchema } from "@/lib/validation/schemas"
import { ValidationError } from "../domain/errors"
import type { ImportRunInput } from "../domain/types"
import { ML_MULTIGET_MAX_IDS } from "../domain/types"

/**
 * Parses and validates the POST body for /api/ml/import-pro/run
 */
export function parseRunRequest(body: unknown): ImportRunInput {
  const result = ImportRunSchema.safeParse(body)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new ValidationError(first?.message ?? "Invalid request body", first?.path?.join("."))
  }

  // Clamp detail_batch to [1, ML_MULTIGET_MAX_IDS], default to ML_MULTIGET_MAX_IDS
  const rawBatch = result.data.detail_batch
  const detail_batch = rawBatch != null ? Math.max(1, Math.min(ML_MULTIGET_MAX_IDS, rawBatch)) : ML_MULTIGET_MAX_IDS

  return {
    account_id: result.data.account_id,
    max_seconds: result.data.max_seconds,
    detail_batch,
    concurrency: result.data.concurrency,
  }
}

/**
 * Parses account_id from query string (for GET endpoints like /status)
 */
export function parseAccountIdFromQuery(searchParams: URLSearchParams): string {
  const raw = Object.fromEntries(searchParams.entries())
  const result = AccountIdQuerySchema.safeParse(raw)
  if (!result.success) {
    throw new ValidationError("account_id query parameter is required", "account_id")
  }
  return result.data.account_id
}

/**
 * Parses account_id from POST body (for /reset)
 */
export function parseAccountIdFromBody(body: unknown): string {
  const result = AccountIdBodySchema.safeParse(body)
  if (!result.success) {
    throw new ValidationError("account_id is required", "account_id")
  }
  return result.data.account_id
}
