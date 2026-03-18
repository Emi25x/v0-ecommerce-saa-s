"use client"

import { useState, useCallback, useRef } from "react"

interface UseAsyncState<T> {
  data: T | null
  error: Error | null
  isLoading: boolean
}

interface UseAsyncReturn<T, Args extends any[]> extends UseAsyncState<T> {
  execute: (...args: Args) => Promise<T | null>
  reset: () => void
}

/**
 * Hook for executing async operations with loading/error state.
 * Useful for mutations, sync operations, imports, etc.
 *
 * @example
 * const { execute: syncStock, isLoading, error } = useAsync(async (sourceId: string) => {
 *   const res = await fetch(`/api/sync/${sourceId}`, { method: "POST" })
 *   if (!res.ok) throw new Error("Sync failed")
 *   return res.json()
 * })
 */
export function useAsync<T = any, Args extends any[] = any[]>(
  asyncFn: (...args: Args) => Promise<T>
): UseAsyncReturn<T, Args> {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    error: null,
    isLoading: false,
  })

  const mountedRef = useRef(true)

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setState({ data: null, error: null, isLoading: true })
      try {
        const result = await asyncFn(...args)
        if (mountedRef.current) {
          setState({ data: result, error: null, isLoading: false })
        }
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        if (mountedRef.current) {
          setState({ data: null, error, isLoading: false })
        }
        return null
      }
    },
    [asyncFn]
  )

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false })
  }, [])

  return { ...state, execute, reset }
}
