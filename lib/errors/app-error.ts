/**
 * Typed application errors for consistent error handling across domains.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "AppError"
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, details)
    this.name = "ValidationError"
  }
}

export class AuthError extends AppError {
  constructor(message: string = "Unauthorized", details?: Record<string, unknown>) {
    super(message, "AUTH_ERROR", 401, details)
    this.name = "AuthError"
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden", details?: Record<string, unknown>) {
    super(message, "FORBIDDEN", 403, details)
    this.name = "ForbiddenError"
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} '${id}' not found` : `${resource} not found`, "NOT_FOUND", 404, { resource, id })
    this.name = "NotFoundError"
  }
}

export class RateLimitError extends AppError {
  constructor(
    message: string = "Rate limit exceeded",
    public readonly retryAfterMs?: number,
  ) {
    super(message, "RATE_LIMIT", 429, { retryAfterMs })
    this.name = "RateLimitError"
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: Record<string, unknown>) {
    super(`[${service}] ${message}`, "EXTERNAL_SERVICE_ERROR", 502, { service, ...details })
    this.name = "ExternalServiceError"
  }
}
