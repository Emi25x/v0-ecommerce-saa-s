/**
 * Domain errors for ML Import Pro
 *
 * Typed error hierarchy that replaces generic Error throws.
 * Each error carries structured context for logging and API responses.
 */

export class ImportDomainError extends Error {
  readonly code: string
  readonly httpStatus: number
  readonly context: Record<string, unknown>

  constructor(message: string, code: string, httpStatus: number, context: Record<string, unknown> = {}) {
    super(message)
    this.name = "ImportDomainError"
    this.code = code
    this.httpStatus = httpStatus
    this.context = context
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...this.context,
    }
  }
}

export class AccountNotFoundError extends ImportDomainError {
  constructor(accountId: string) {
    super("Account not found", "ACCOUNT_NOT_FOUND", 404, { account_id: accountId })
    this.name = "AccountNotFoundError"
  }
}

export class ProgressNotFoundError extends ImportDomainError {
  constructor(accountId: string) {
    super("Progress not found. Initialize the import first.", "PROGRESS_NOT_FOUND", 404, { account_id: accountId })
    this.name = "ProgressNotFoundError"
  }
}

export class ConcurrentRunError extends ImportDomainError {
  readonly retryAfterMs: number

  constructor(accountId: string, retryAfterMs: number) {
    super("Import already running", "CONCURRENT_RUN", 409, {
      account_id: accountId,
      retry_after_ms: retryAfterMs,
    })
    this.name = "ConcurrentRunError"
    this.retryAfterMs = retryAfterMs
  }
}

export class RateLimitedError extends ImportDomainError {
  readonly waitSeconds: number

  constructor(accountId: string, waitSeconds: number) {
    super(`Rate limited, resume in ${waitSeconds}s`, "RATE_LIMITED", 200, {
      account_id: accountId,
      rate_limited: true,
      wait_seconds: waitSeconds,
    })
    this.name = "RateLimitedError"
    this.waitSeconds = waitSeconds
  }
}

export class DatabaseError extends ImportDomainError {
  constructor(operation: string, details: string) {
    super(`Database error during ${operation}`, "DATABASE_ERROR", 503, { operation, details })
    this.name = "DatabaseError"
  }
}

export class MlApiError extends ImportDomainError {
  constructor(operation: string, status: number, body: string) {
    super(`ML API error: ${operation} returned HTTP ${status}`, "ML_API_ERROR", 502, {
      operation,
      ml_status: status,
      ml_body: body.slice(0, 300),
    })
    this.name = "MlApiError"
  }
}

export class ScrollExpiredError extends ImportDomainError {
  readonly coveragePct: number

  constructor(accountId: string, seen: number, total: number) {
    const pct = Math.round((seen / total) * 100)
    super(
      `Scroll ML expirado al ${pct}% (${seen}/${total} vistos). Reiniciando scan.`,
      "SCROLL_EXPIRED",
      200,
      { account_id: accountId, seen, total, coverage_pct: pct },
    )
    this.name = "ScrollExpiredError"
    this.coveragePct = pct
  }
}

export class ValidationError extends ImportDomainError {
  constructor(message: string, field?: string) {
    super(message, "VALIDATION_ERROR", 400, { field })
    this.name = "ValidationError"
  }
}
