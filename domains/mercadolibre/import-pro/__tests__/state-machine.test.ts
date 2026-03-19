import { describe, it, expect } from "vitest"
import { canTransition, assertTransition, canStartRun, isTerminal, isActive } from "../domain/state-machine"
import type { ImportStatus } from "../domain/types"

describe("ImportStateMachine", () => {
  describe("canTransition", () => {
    const validTransitions: [ImportStatus, ImportStatus][] = [
      ["idle", "running"],
      ["running", "idle"],
      ["running", "paused"],
      ["running", "done"],
      ["running", "failed"],
      ["running", "scan_complete_pending_verification"],
      ["paused", "idle"],
      ["paused", "running"],
      ["done", "idle"],
      ["failed", "idle"],
      ["scan_complete_pending_verification", "idle"],
      ["scan_complete_pending_verification", "done"],
      ["scan_complete_pending_verification", "failed"],
    ]

    it.each(validTransitions)("allows %s → %s", (from, to) => {
      expect(canTransition(from, to)).toBe(true)
    })

    const invalidTransitions: [ImportStatus, ImportStatus][] = [
      ["idle", "done"],
      ["idle", "paused"],
      ["idle", "failed"],
      ["done", "running"],
      ["done", "paused"],
      ["failed", "running"],
      ["paused", "done"],
      ["paused", "failed"],
    ]

    it.each(invalidTransitions)("rejects %s → %s", (from, to) => {
      expect(canTransition(from, to)).toBe(false)
    })
  })

  describe("assertTransition", () => {
    it("returns the next status on valid transition", () => {
      expect(assertTransition("idle", "running")).toBe("running")
    })

    it("throws on invalid transition", () => {
      expect(() => assertTransition("idle", "done")).toThrow("Invalid state transition: idle → done")
    })
  })

  describe("canStartRun", () => {
    it("allows starting from idle", () => expect(canStartRun("idle")).toBe(true))
    it("allows starting from paused", () => expect(canStartRun("paused")).toBe(true))
    it("allows starting from failed", () => expect(canStartRun("failed")).toBe(true))
    it("allows starting from scan_complete_pending_verification", () =>
      expect(canStartRun("scan_complete_pending_verification")).toBe(true))
    it("rejects starting from running", () => expect(canStartRun("running")).toBe(false))
    it("rejects starting from done", () => expect(canStartRun("done")).toBe(false))
  })

  describe("isTerminal", () => {
    it("done is terminal", () => expect(isTerminal("done")).toBe(true))
    it("scan_complete_pending_verification is terminal", () =>
      expect(isTerminal("scan_complete_pending_verification")).toBe(true))
    it("running is not terminal", () => expect(isTerminal("running")).toBe(false))
    it("idle is not terminal", () => expect(isTerminal("idle")).toBe(false))
  })

  describe("isActive", () => {
    it("running is active", () => expect(isActive("running")).toBe(true))
    it("idle is not active", () => expect(isActive("idle")).toBe(false))
    it("paused is not active", () => expect(isActive("paused")).toBe(false))
  })
})
