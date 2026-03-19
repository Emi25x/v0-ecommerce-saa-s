/**
 * Structured Logger for production observability.
 *
 * Every log line is a single JSON object written to stdout/stderr.
 * In Vercel, stdout is captured and forwarded to log drains
 * (Datadog, Logflare, etc.) — zero config needed.
 *
 * SECURITY: Never log tokens, passwords, or PII.
 *
 * Usage:
 *   const log = createStructuredLogger({ requestId: "abc", accountId: "123" })
 *   log.info("scan_started", "ml.scan", { offset: 0 })
 *
 *   const result = await log.timed("ml.scan", () => mlClient.scanItems(...))
 *   // Automatically logs: operation=ml.scan, duration_ms=142, status=ok
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error"

export interface LogFields {
  /** ISO 8601 timestamp */
  timestamp: string
  /** Log severity */
  level: LogLevel
  /** Human-readable description */
  message: string
  /** Unique per HTTP request */
  request_id?: string
  /** Unique per import run (from process_runs.id) */
  run_id?: string
  /** ML account being processed */
  account_id?: string
  /** What is being done (ml.scan, ml.multiget, db.upsert, etc.) */
  operation?: string
  /** How long the operation took */
  duration_ms?: number
  /** Outcome: ok, error, rate_limited, partial, timeout */
  status?: string
  /** Machine-readable error code */
  error_code?: string
  /** Extra structured data */
  [key: string]: unknown
}

/** Context fields that persist across all log calls from the same logger. */
export interface LogContext {
  request_id?: string
  run_id?: string
  account_id?: string
}

// ── Logger ─────────────────────────────────────────────────────────────────

export interface StructuredLogger {
  info(message: string, operation?: string, data?: Record<string, unknown>): void
  warn(message: string, operation?: string, data?: Record<string, unknown>): void
  error(message: string, err: unknown, operation?: string, data?: Record<string, unknown>): void

  /**
   * Time an async operation. Logs duration_ms + status automatically.
   * On success: status=ok. On error: status=error + error_code.
   */
  timed<T>(operation: string, fn: () => Promise<T>, data?: Record<string, unknown>): Promise<T>

  /** Create a child logger with extra context fields. */
  child(extraContext: Partial<LogContext>): StructuredLogger
}

export function createStructuredLogger(context: LogContext): StructuredLogger {
  function emit(
    level: LogLevel,
    message: string,
    operation?: string,
    data?: Record<string, unknown>,
    err?: unknown,
  ): void {
    const entry: LogFields = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
      ...(operation && { operation }),
      ...data,
    }

    if (err) {
      entry.error_code = extractErrorCode(err)
      entry.status = entry.status ?? "error"
      // Log message + stack, but NEVER log tokens or auth headers
      if (err instanceof Error) {
        entry.error_message = err.message
        entry.error_stack = err.stack?.split("\n").slice(0, 5).join("\n")
      } else {
        entry.error_message = String(err)
      }
    }

    const line = JSON.stringify(entry)
    if (level === "error") {
      console.error(line)
    } else if (level === "warn") {
      console.warn(line)
    } else {
      console.log(line)
    }
  }

  const logger: StructuredLogger = {
    info(message, operation, data) {
      emit("info", message, operation, data)
    },

    warn(message, operation, data) {
      emit("warn", message, operation, data)
    },

    error(message, err, operation, data) {
      emit("error", message, operation, data, err)
    },

    async timed<T>(operation: string, fn: () => Promise<T>, data?: Record<string, unknown>): Promise<T> {
      const t0 = performance.now()
      try {
        const result = await fn()
        const duration_ms = Math.round(performance.now() - t0)
        emit("info", `${operation} completed`, operation, {
          duration_ms,
          status: "ok",
          ...data,
        })
        return result
      } catch (err) {
        const duration_ms = Math.round(performance.now() - t0)
        emit("error", `${operation} failed`, operation, {
          duration_ms,
          status: "error",
          ...data,
        }, err)
        throw err
      }
    },

    child(extraContext) {
      return createStructuredLogger({ ...context, ...extraContext })
    },
  }

  return logger
}

// ── Helpers ────────────────────────────────────────────────────────────────

let counter = 0

/** Short request ID for correlation (timestamp + counter). */
export function genRequestId(): string {
  return `${Date.now().toString(36)}-${(counter++).toString(36)}`
}

/** Extract a machine-readable error code from an error object. */
function extractErrorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown"
  // Domain errors
  if ("code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code
  }
  // HTTP errors
  if ("status" in err && typeof (err as { status: unknown }).status === "number") {
    return `http_${(err as { status: number }).status}`
  }
  // Timeout
  if (err instanceof Error && err.name === "AbortError") return "timeout"
  if (err instanceof Error && err.name === "TimeoutError") return "timeout"
  return "unknown"
}

/** Measure an async operation and return { result, duration_ms }. */
export async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; duration_ms: number }> {
  const t0 = performance.now()
  const result = await fn()
  return { result, duration_ms: Math.round(performance.now() - t0) }
}
