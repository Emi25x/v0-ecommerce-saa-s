"use client"

import useSWR, { type SWRConfiguration } from "swr"

const defaultFetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    const error = new Error(`Request failed: ${res.status}`)
    ;(error as any).status = res.status
    try {
      ;(error as any).info = await res.json()
    } catch {}
    throw error
  }
  return res.json()
}

/**
 * SWR-based data fetching hook with sensible defaults.
 *
 * @param url - API endpoint (or null/undefined to skip fetching)
 * @param options - SWR configuration overrides
 */
export function useFetch<T = any>(
  url: string | null | undefined,
  options?: SWRConfiguration
) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
    url ?? null,
    defaultFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      ...options,
    }
  )

  return {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  }
}

/**
 * Fetcher for POST requests with SWR.
 */
export function usePostFetch<T = any>(
  url: string | null | undefined,
  body: Record<string, any> | null,
  options?: SWRConfiguration
) {
  const key = url && body ? [url, JSON.stringify(body)] : null

  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
    key,
    async ([url]: [string]) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const error = new Error(`Request failed: ${res.status}`)
        ;(error as any).status = res.status
        throw error
      }
      return res.json()
    },
    {
      revalidateOnFocus: false,
      ...options,
    }
  )

  return { data, error, isLoading, isValidating, mutate }
}
