import { describe, it, expect } from "vitest"
import {
  parseRunRequest,
  parseAccountIdFromQuery,
  parseAccountIdFromBody,
} from "../application/request-parser"
import { ValidationError } from "../domain/errors"

describe("parseRunRequest", () => {
  it("parses valid request with all fields", () => {
    const result = parseRunRequest({
      account_id: "acc-123",
      max_seconds: 20,
      detail_batch: 10,
      concurrency: 3,
    })

    expect(result).toEqual({
      account_id: "acc-123",
      max_seconds: 20,
      detail_batch: 10,
      concurrency: 3,
    })
  })

  it("applies defaults for optional fields", () => {
    const result = parseRunRequest({ account_id: "acc-123" })

    expect(result).toEqual({
      account_id: "acc-123",
      max_seconds: 12,
      detail_batch: 20,
      concurrency: 2,
    })
  })

  it("clamps detail_batch to ML_MULTIGET_MAX_IDS", () => {
    const result = parseRunRequest({ account_id: "acc-123", detail_batch: 100 })
    expect(result.detail_batch).toBe(20) // ML max
  })

  it("clamps detail_batch minimum to 1", () => {
    const result = parseRunRequest({ account_id: "acc-123", detail_batch: 0 })
    expect(result.detail_batch).toBe(1)
  })

  it("throws ValidationError when body is null", () => {
    expect(() => parseRunRequest(null)).toThrow(ValidationError)
  })

  it("throws ValidationError when account_id is missing", () => {
    expect(() => parseRunRequest({ max_seconds: 10 })).toThrow(ValidationError)
  })

  it("throws ValidationError when account_id is not a string", () => {
    expect(() => parseRunRequest({ account_id: 123 })).toThrow(ValidationError)
  })
})

describe("parseAccountIdFromQuery", () => {
  it("extracts account_id from search params", () => {
    const params = new URLSearchParams("account_id=acc-456")
    expect(parseAccountIdFromQuery(params)).toBe("acc-456")
  })

  it("throws when account_id is missing", () => {
    const params = new URLSearchParams("")
    expect(() => parseAccountIdFromQuery(params)).toThrow(ValidationError)
  })
})

describe("parseAccountIdFromBody", () => {
  it("extracts account_id from body", () => {
    expect(parseAccountIdFromBody({ account_id: "acc-789" })).toBe("acc-789")
  })

  it("throws when body is null", () => {
    expect(() => parseAccountIdFromBody(null)).toThrow(ValidationError)
  })

  it("throws when account_id is missing", () => {
    expect(() => parseAccountIdFromBody({})).toThrow(ValidationError)
  })
})
