/**
 * Factory — wires up the orchestrator with real infrastructure.
 *
 * Single place to construct the full dependency graph.
 * Route handlers call this instead of knowing about Supabase directly.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { ImportOrchestrator } from "./import-orchestrator"
import { MercadoLibreClient } from "../infrastructure/ml-client"
import { SupabaseProgressRepository } from "../infrastructure/supabase-progress-repo"
import { SupabasePublicationRepository } from "../infrastructure/supabase-publication-repo"
import { SupabaseAccountRepository } from "../infrastructure/supabase-account-repo"
import { ProcessRunLogger } from "../infrastructure/process-run-logger"

/**
 * Creates a fully wired ImportOrchestrator with Supabase infrastructure.
 * The ML client is created lazily (needs account_id for token resolution).
 */
export async function createOrchestrator(
  db: SupabaseClient,
  accountId: string,
): Promise<ImportOrchestrator> {
  const mlClient = await MercadoLibreClient.create(accountId)
  const progressRepo = new SupabaseProgressRepository(db)
  const publicationRepo = new SupabasePublicationRepository(db)
  const accountRepo = new SupabaseAccountRepository(db)
  const runLogger = new ProcessRunLogger(db)

  return new ImportOrchestrator(
    mlClient,
    progressRepo,
    publicationRepo,
    accountRepo,
    runLogger,
  )
}

/**
 * Creates an orchestrator for read-only operations (status, reset)
 * that don't need an ML API client.
 */
export function createReadOnlyOrchestrator(db: SupabaseClient): ImportOrchestrator {
  // Use a null ML client — these operations don't call ML API
  const noopClient = {
    scanItems: () => Promise.reject(new Error("ML client not available")),
    getItemDetails: () => Promise.reject(new Error("ML client not available")),
    refreshToken: () => Promise.reject(new Error("ML client not available")),
  }

  return new ImportOrchestrator(
    noopClient,
    new SupabaseProgressRepository(db),
    new SupabasePublicationRepository(db),
    new SupabaseAccountRepository(db),
    new ProcessRunLogger(db),
  )
}
