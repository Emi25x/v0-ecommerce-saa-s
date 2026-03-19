/**
 * Request parsing helpers with Zod validation.
 *
 * Usage:
 *   const parsed = await parseBody(request, MySchema)
 *   if (!parsed.ok) return parsed.response
 *   // parsed.data is typed and validated
 */
import { type NextRequest } from "next/server"
import { type ZodSchema } from "zod"
import { apiValidation, apiBadRequest } from "@/lib/api/response"

// ---------------------------------------------------------------------------
// parseBody — validate JSON body against a Zod schema
// ---------------------------------------------------------------------------

type ParseSuccess<T> = { ok: true; data: T }
type ParseFailure = { ok: false; response: ReturnType<typeof apiValidation> }
type ParseResult<T> = ParseSuccess<T> | ParseFailure

export async function parseBody<T>(request: NextRequest | Request, schema: ZodSchema<T>): Promise<ParseResult<T>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: apiBadRequest("Invalid JSON body") }
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    return { ok: false, response: apiValidation(result.error.issues) }
  }

  return { ok: true, data: result.data }
}

// ---------------------------------------------------------------------------
// parseQuery — validate URL search params against a Zod schema
// ---------------------------------------------------------------------------

export function parseQuery<T>(request: NextRequest, schema: ZodSchema<T>): ParseResult<T> {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries())
  const result = schema.safeParse(params)

  if (!result.success) {
    return { ok: false, response: apiValidation(result.error.issues) }
  }

  return { ok: true, data: result.data }
}
