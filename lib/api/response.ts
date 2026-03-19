/**
 * Standardized API response helpers.
 *
 * Every route handler should return responses through these helpers
 * to ensure a consistent shape for the frontend.
 *
 * Success: { ok: true, data: T }
 * Error:   { ok: false, error: { code: string, detail: string | object } }
 */
import { NextResponse } from "next/server"

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export function apiError(code: string, detail: string | Record<string, unknown> | unknown[], status = 500) {
  return NextResponse.json({ ok: false, error: { code, detail } }, { status })
}

/** 400 Bad Request */
export function apiBadRequest(detail: string | Record<string, unknown> | unknown[]) {
  return apiError("bad_request", detail, 400)
}

/** 401 Unauthorized */
export function apiUnauthorized(detail = "Autenticación requerida") {
  return apiError("unauthorized", detail, 401)
}

/** 404 Not Found */
export function apiNotFound(detail = "Recurso no encontrado") {
  return apiError("not_found", detail, 404)
}

/** 409 Conflict */
export function apiConflict(detail: string) {
  return apiError("conflict", detail, 409)
}

/** 422 Unprocessable Entity — for validation errors */
export function apiValidation(issues: unknown[]) {
  return apiError("validation_error", issues, 422)
}

/** 429 Too Many Requests */
export function apiRateLimit(detail = "Demasiadas solicitudes") {
  return apiError("rate_limit", detail, 429)
}

/** 500 Internal Server Error — never expose stack traces */
export function apiInternal(detail = "Error interno del servidor") {
  return apiError("internal_error", detail, 500)
}
