/**
 * Structured Logger
 *
 * Provides structured JSON logging with correlation IDs for tracing
 * requests across the system. Designed for future integration with
 * Sentry, Logflare, Datadog, or any log aggregation service.
 *
 * Usage:
 *   const log = createLogger({ requestId: "abc", accountId: "123" })
 *   log.info("scan_started", { offset: 0, total: 500 })
 *   log.warn("scroll_expired", { pctCovered: 0.45 })
 *   log.error("upsert_failed", { rows: 50, error: "timeout" })
 */

export type LogLevel = "info" | "warn" | "error"

export interface LogContext {
  requestId?: string
  runId?: string
  accountId?: string
  process?: string
  [key: string]: string | undefined
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  process: string
  event: string
  context: LogContext
  data?: Record<string, unknown>
  error?: { message: string; stack?: string }
}

/**
 * Transport interface for pluggable log destinations.
 * Implement this to send logs to Sentry, Logflare, Datadog, etc.
 */
export interface LogTransport {
  send(entry: LogEntry): void
}

/**
 * Default transport: writes structured JSON to console.
 * In production, Vercel captures stdout/stderr and forwards to
 * configured log drains (Datadog, Logflare, etc).
 */
class ConsoleTransport implements LogTransport {
  send(entry: LogEntry): void {
    const line = JSON.stringify(entry)
    switch (entry.level) {
      case "error":
        console.error(line)
        break
      case "warn":
        console.warn(line)
        break
      default:
        console.log(line)
    }
  }
}

// ── Global transport registry ──────────────────────────────────────────────

const transports: LogTransport[] = [new ConsoleTransport()]

/** Register an additional transport (Sentry, Logflare, Datadog, etc.) */
export function addTransport(transport: LogTransport): void {
  transports.push(transport)
}

/** Remove all non-default transports (useful for testing). */
export function resetTransports(): void {
  transports.length = 1
}

// ── Logger ─────────────────────────────────────────────────────────────────

export interface Logger {
  info(event: string, data?: Record<string, unknown>): void
  warn(event: string, data?: Record<string, unknown>): void
  error(event: string, error: unknown, data?: Record<string, unknown>): void
  child(extraContext: Partial<LogContext>): Logger
}

export function createLogger(context: LogContext): Logger {
  const processName = context.process ?? "unknown"

  function emit(level: LogLevel, event: string, data?: Record<string, unknown>, err?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      process: processName,
      event,
      context,
    }

    if (data && Object.keys(data).length > 0) {
      entry.data = data
    }

    if (err) {
      entry.error = {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }
    }

    for (const transport of transports) {
      try {
        transport.send(entry)
      } catch {
        // Never let logging break the app
      }
    }
  }

  return {
    info(event, data) {
      emit("info", event, data)
    },
    warn(event, data) {
      emit("warn", event, data)
    },
    error(event, err, data) {
      emit("error", event, data, err)
    },
    child(extraContext) {
      return createLogger({ ...context, ...extraContext })
    },
  }
}

// ── Request ID helper ──────────────────────────────────────────────────────

let counter = 0

/** Generate a short request ID (timestamp + counter). */
export function generateRequestId(): string {
  const ts = Date.now().toString(36)
  const seq = (counter++).toString(36)
  return `${ts}-${seq}`
}
