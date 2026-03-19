import { NextResponse } from "next/server"
import { AppError } from "./app-error"

/**
 * Standard error handler for API route handlers.
 *
 * Returns the unified error shape:
 *   { ok: false, error: { code, detail } }
 *
 * Handles:
 *  - AppError subtypes → mapped status code
 *  - ImportDomainError (import-pro) → httpStatus + code
 *  - ZodError → 422 validation_error with issues
 *  - Unknown → 500 generic
 */
export function handleRouteError(error: unknown): NextResponse {
  // AppError hierarchy (lib/errors/app-error.ts)
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          detail: error.message,
          ...(error.details && { details: error.details }),
        },
      },
      { status: error.statusCode },
    )
  }

  // Zod validation errors → 422
  if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown[] }).issues)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation_error",
          detail: (error as { issues: unknown[] }).issues,
        },
      },
      { status: 422 },
    )
  }

  // ImportDomainError (has .code and .httpStatus)
  if (error instanceof Error && "httpStatus" in error && "code" in error) {
    const domainErr = error as Error & { httpStatus: number; code: string; context?: Record<string, unknown> }
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: domainErr.code,
          detail: domainErr.message,
          ...(domainErr.context && { details: domainErr.context }),
        },
      },
      { status: domainErr.httpStatus },
    )
  }

  const message = error instanceof Error ? error.message : "Internal server error"
  console.error("[UNHANDLED]", error)

  return NextResponse.json(
    { ok: false, error: { code: "internal_error", detail: message } },
    { status: 500 },
  )
}
