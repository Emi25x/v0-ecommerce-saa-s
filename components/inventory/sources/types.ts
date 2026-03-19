export interface ImportSource {
  id: string
  name: string
  description: string | null
  feed_type: string
  url_template: string | null
  column_mapping: Record<string, string>
  overwrite_duplicates: boolean
  created_at: string
  updated_at: string
}

export interface ImportSchedule {
  id: string
  source_id: string
  frequency: string
  timezone: string
  enabled: boolean
  hour: number
  minute: number
  day_of_week: number | null
  day_of_month: number | null
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
}

export interface SourceWithSchedule extends ImportSource {
  schedules: ImportSchedule[]
  last_import?: {
    started_at: string
    status: string
    products_imported: number
    products_updated: number
    products_failed: number
  }
}

export interface ImportProgressState {
  total: number
  processed: number
  imported: number
  updated: number
  failed: number
  skipped: number
  status: "running" | "completed" | "cancelled" | "error"
  startTime: Date | null
  lastUpdate: Date | null
  speed: number
  errors: Array<{ sku: string; error: string; details?: string }>
  csvInfo: null | {
    separator: string
    headers: string[]
    firstRow: Record<string, string>
  }
}

export const INITIAL_IMPORT_PROGRESS: ImportProgressState = {
  total: 0,
  processed: 0,
  imported: 0,
  updated: 0,
  failed: 0,
  skipped: 0,
  status: "running",
  startTime: null,
  lastUpdate: null,
  speed: 0,
  errors: [],
  csvInfo: null,
}
