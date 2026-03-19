/**
 * Import State Machine
 *
 * Defines valid state transitions for the import process.
 * Enforces invariants at the domain level — no infrastructure deps.
 */

import type { ImportStatus } from "./types"

/**
 * Valid transitions: source → allowed targets
 */
const TRANSITIONS: Record<ImportStatus, ImportStatus[]> = {
  idle: ["running"],
  running: ["idle", "paused", "done", "failed", "scan_complete_pending_verification"],
  paused: ["idle", "running"],
  done: ["idle"], // reset
  failed: ["idle"], // reset / retry
  scan_complete_pending_verification: ["idle", "done", "failed"],
}

/**
 * Returns true if the transition from `current` to `next` is valid.
 */
export function canTransition(current: ImportStatus, next: ImportStatus): boolean {
  return TRANSITIONS[current]?.includes(next) ?? false
}

/**
 * Asserts the transition is valid and returns the next status.
 * Throws if invalid — use this in the orchestrator for safety.
 */
export function assertTransition(current: ImportStatus, next: ImportStatus): ImportStatus {
  if (!canTransition(current, next)) {
    throw new Error(`Invalid state transition: ${current} → ${next}`)
  }
  return next
}

/**
 * Whether the status allows starting a new run.
 */
export function canStartRun(status: ImportStatus): boolean {
  return status === "idle" || status === "paused" || status === "failed" || status === "scan_complete_pending_verification"
}

/**
 * Whether the status indicates completion (done or needs verification).
 */
export function isTerminal(status: ImportStatus): boolean {
  return status === "done" || status === "scan_complete_pending_verification"
}

/**
 * Whether the status indicates the process is actively working.
 */
export function isActive(status: ImportStatus): boolean {
  return status === "running"
}
