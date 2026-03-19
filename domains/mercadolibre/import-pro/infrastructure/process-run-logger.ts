/**
 * Process Run Logger — wraps lib/process-runs for the import-pro module.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { IImportRunLogger, IRunHandle } from "./interfaces"
import { startRun } from "@/lib/process-runs"

export class ProcessRunLogger implements IImportRunLogger {
  constructor(private readonly db: SupabaseClient) {}

  async start(): Promise<IRunHandle> {
    const run = await startRun(this.db, "ml_import_pro", "ML Import Pro")
    return {
      complete: (data) => run.complete(data),
      fail: (err) => run.fail(err),
    }
  }
}
