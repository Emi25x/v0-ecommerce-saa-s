import { NextResponse } from "next/server"
import { AppError } from "./app-error"

/**
 * Standard error handler for API route handlers.
 * Converts AppError subtypes to proper HTTP responses,
 * and catches unknown errors with a generic 500.
 */
export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      },
      { status: error.statusCode },
    )
  }

  const message = error instanceof Error ? error.message : "Internal server error"
  console.error("[UNHANDLED]", error)

  return NextResponse.json(
    { error: message, code: "INTERNAL_ERROR" },
    { status: 500 },
  )
}
