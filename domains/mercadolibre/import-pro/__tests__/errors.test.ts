import { describe, it, expect } from "vitest"
import {
  ImportDomainError,
  AccountNotFoundError,
  ProgressNotFoundError,
  ConcurrentRunError,
  RateLimitedError,
  ValidationError,
  ScrollExpiredError,
} from "../domain/errors"

describe("Domain Errors", () => {
  it("AccountNotFoundError has correct properties", () => {
    const err = new AccountNotFoundError("acc-123")
    expect(err.code).toBe("ACCOUNT_NOT_FOUND")
    expect(err.httpStatus).toBe(404)
    expect(err.message).toBe("Account not found")
    expect(err.toJSON()).toEqual({
      error: "ACCOUNT_NOT_FOUND",
      message: "Account not found",
      account_id: "acc-123",
    })
  })

  it("ConcurrentRunError includes retry_after_ms", () => {
    const err = new ConcurrentRunError("acc-123", 45000)
    expect(err.httpStatus).toBe(409)
    expect(err.retryAfterMs).toBe(45000)
    expect(err.toJSON()).toMatchObject({
      error: "CONCURRENT_RUN",
      retry_after_ms: 45000,
    })
  })

  it("RateLimitedError has 200 status", () => {
    const err = new RateLimitedError("acc-123", 30)
    expect(err.httpStatus).toBe(200)
    expect(err.waitSeconds).toBe(30)
    expect(err.toJSON()).toMatchObject({
      rate_limited: true,
      wait_seconds: 30,
    })
  })

  it("ValidationError has 400 status", () => {
    const err = new ValidationError("bad field", "account_id")
    expect(err.httpStatus).toBe(400)
    expect(err.toJSON()).toMatchObject({
      error: "VALIDATION_ERROR",
      field: "account_id",
    })
  })

  it("ScrollExpiredError calculates coverage percentage", () => {
    const err = new ScrollExpiredError("acc-123", 3000, 10000)
    expect(err.coveragePct).toBe(30)
    expect(err.message).toContain("30%")
    expect(err.message).toContain("3000/10000")
  })

  it("all domain errors extend ImportDomainError", () => {
    expect(new AccountNotFoundError("x")).toBeInstanceOf(ImportDomainError)
    expect(new ProgressNotFoundError("x")).toBeInstanceOf(ImportDomainError)
    expect(new ConcurrentRunError("x", 1)).toBeInstanceOf(ImportDomainError)
    expect(new RateLimitedError("x", 1)).toBeInstanceOf(ImportDomainError)
    expect(new ValidationError("x")).toBeInstanceOf(ImportDomainError)
    expect(new ScrollExpiredError("x", 1, 2)).toBeInstanceOf(ImportDomainError)
  })

  it("all domain errors extend Error", () => {
    const err = new AccountNotFoundError("x")
    expect(err).toBeInstanceOf(Error)
    expect(err.stack).toBeDefined()
  })
})
