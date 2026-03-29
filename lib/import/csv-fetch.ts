/**
 * Generic CSV/TSV file fetcher and parser.
 * Downloads once, parses once. Returns array of row objects.
 */

import Papa from "papaparse"
import { detectDelimiter } from "@/lib/import/csv-helpers"

export interface FetchCsvOptions {
  url: string
  authType?: string | null
  credentials?: Record<string, any> | null
  delimiter?: string | null
  encoding?: string
}

export async function fetchAndParseCsv(options: FetchCsvOptions): Promise<Record<string, string>[]> {
  const headers: Record<string, string> = { "User-Agent": "Ecommerce-Manager/1.0" }

  if (options.authType === "basic_auth" && options.credentials?.username) {
    headers["Authorization"] = `Basic ${Buffer.from(`${options.credentials.username}:${options.credentials.password}`).toString("base64")}`
  } else if (options.authType === "bearer_token" && options.credentials?.token) {
    headers["Authorization"] = `Bearer ${options.credentials.token}`
  }

  const res = await fetch(options.url, { headers })
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const text = buffer.toString(options.encoding === "latin1" ? "latin1" : "utf-8")

  const delimiter = options.delimiter || detectDelimiter(text.split("\n")[0] ?? "")

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
  })

  return parsed.data as Record<string, string>[]
}
