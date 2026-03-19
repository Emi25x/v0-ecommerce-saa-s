/**
 * Pluggable transport adapters for external observability platforms.
 *
 * These are stubs that can be activated when the corresponding SDK
 * is installed and configured. Each transport implements LogTransport.
 *
 * Setup example:
 *   import { addTransport } from "@/lib/observability/logger"
 *   import { createSentryTransport } from "@/lib/observability/transports"
 *   addTransport(createSentryTransport())
 */

import type { LogTransport, LogEntry } from "./logger"

// ── Sentry ─────────────────────────────────────────────────────────────────

interface SentryLike {
  captureException(err: Error, context?: Record<string, unknown>): void
  addBreadcrumb(breadcrumb: Record<string, unknown>): void
}

/**
 * Sends error-level logs to Sentry as exceptions,
 * and info/warn as breadcrumbs for context.
 *
 * Usage:
 *   import * as Sentry from "@sentry/nextjs"
 *   addTransport(createSentryTransport(Sentry))
 */
export function createSentryTransport(sentry: SentryLike): LogTransport {
  return {
    send(entry: LogEntry) {
      if (entry.level === "error" && entry.error) {
        sentry.captureException(
          new Error(entry.error.message),
          {
            tags: {
              process: entry.process,
              event: entry.event,
              accountId: entry.context.accountId,
            },
            extra: {
              ...entry.context,
              ...entry.data,
            },
          },
        )
      } else {
        sentry.addBreadcrumb({
          category: entry.process,
          message: entry.event,
          level: entry.level,
          data: { ...entry.context, ...entry.data },
        })
      }
    },
  }
}

// ── Logflare / Generic HTTP ────────────────────────────────────────────────

interface HttpTransportOptions {
  url: string
  apiKey?: string
  headers?: Record<string, string>
  batchSize?: number
  flushIntervalMs?: number
}

/**
 * Batches and sends log entries via HTTP POST.
 * Works with Logflare, Datadog HTTP intake, or any JSON log endpoint.
 *
 * Usage:
 *   addTransport(createHttpTransport({
 *     url: "https://api.logflare.app/logs",
 *     apiKey: process.env.LOGFLARE_API_KEY,
 *     headers: { "X-API-KEY": process.env.LOGFLARE_API_KEY },
 *   }))
 */
export function createHttpTransport(opts: HttpTransportOptions): LogTransport {
  const buffer: LogEntry[] = []
  const batchSize = opts.batchSize ?? 10
  const flushInterval = opts.flushIntervalMs ?? 5000

  let timer: ReturnType<typeof setInterval> | null = null

  function flush() {
    if (buffer.length === 0) return
    const batch = buffer.splice(0, buffer.length)

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...opts.headers,
    }
    if (opts.apiKey) {
      headers["Authorization"] = `Bearer ${opts.apiKey}`
    }

    // Fire-and-forget — never block the main thread
    fetch(opts.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ batch }),
    }).catch(() => {
      // Silently drop — logging should never crash the app
    })
  }

  return {
    send(entry: LogEntry) {
      buffer.push(entry)

      if (buffer.length >= batchSize) {
        flush()
      }

      if (!timer) {
        timer = setInterval(flush, flushInterval)
        // Unref so the timer doesn't keep the process alive
        if (typeof timer === "object" && "unref" in timer) {
          timer.unref()
        }
      }
    },
  }
}

// ── Datadog ────────────────────────────────────────────────────────────────

/**
 * Datadog HTTP intake adapter. Transforms log entries to DD format.
 *
 * Usage:
 *   addTransport(createDatadogTransport({
 *     apiKey: process.env.DD_API_KEY!,
 *     service: "ecommerce-saas",
 *     env: process.env.NODE_ENV,
 *   }))
 */
export function createDatadogTransport(opts: {
  apiKey: string
  service?: string
  env?: string
  site?: string
}): LogTransport {
  const site = opts.site ?? "datadoghq.com"
  const url = `https://http-intake.logs.${site}/api/v2/logs`

  return createHttpTransport({
    url,
    headers: {
      "DD-API-KEY": opts.apiKey,
      "Content-Type": "application/json",
    },
    batchSize: 20,
    flushIntervalMs: 3000,
  })
}
