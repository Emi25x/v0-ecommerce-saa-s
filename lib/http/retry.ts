/**
 * Generic retry with exponential backoff.
 */
export interface RetryOptions {
  retries?: number
  backoffMs?: number
  maxBackoffMs?: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

const defaults: Required<RetryOptions> = {
  retries: 3,
  backoffMs: 1000,
  maxBackoffMs: 30_000,
  shouldRetry: () => true,
}

export async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const { retries, backoffMs, maxBackoffMs, shouldRetry } = { ...defaults, ...opts }
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === retries || !shouldRetry(err, attempt)) break
      const delay = Math.min(backoffMs * 2 ** attempt, maxBackoffMs)
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  throw lastError
}
