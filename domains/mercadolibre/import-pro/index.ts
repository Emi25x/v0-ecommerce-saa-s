/**
 * ML Import Pro — Public API
 *
 * Re-exports everything needed by route handlers and external consumers.
 */

// Domain
export * from "./domain/types"
export * from "./domain/errors"
export * from "./domain/state-machine"
export * from "./domain/publication-mapper"

// Application
export { ImportOrchestrator } from "./application/import-orchestrator"
export { createOrchestrator, createReadOnlyOrchestrator } from "./application/factory"
export { parseRunRequest, parseAccountIdFromQuery, parseAccountIdFromBody } from "./application/request-parser"
export { runPool } from "./application/concurrency-pool"

// Infrastructure interfaces
export type {
  IMercadoLibreClient,
  IImportProgressRepository,
  IPublicationRepository,
  IMlAccountRepository,
  IImportRunLogger,
  IRunHandle,
} from "./infrastructure/interfaces"
