/**
 * Zod schemas for API request validation.
 *
 * Centralizes input contracts for critical endpoints.
 * Import individual schemas as needed — keeps bundle size minimal.
 */
import { z } from "zod"

// ── Common primitives ──────────────────────────────────────────────────────

/** UUID-like string (accepts both uuid v4 and Supabase-style IDs) */
export const zUUID = z.string().min(1, "ID is required").max(128)

/** Positive integer, typically for pagination or batch sizes */
export const zPositiveInt = z.coerce.number().int().positive()

// ── Import Pro ─────────────────────────────────────────────────────────────

export const ImportRunSchema = z.object({
  account_id: zUUID,
  max_seconds: z.number().int().min(1).max(300).optional().default(12),
  /** Accepts any non-negative int; the parser clamps to [1, ML_MULTIGET_MAX_IDS] */
  detail_batch: z.number().int().min(0).optional(),
  concurrency: z.number().int().min(1).max(10).optional().default(2),
})
export type ImportRunInput = z.infer<typeof ImportRunSchema>

export const AccountIdBodySchema = z.object({
  account_id: zUUID,
})

export const AccountIdQuerySchema = z.object({
  account_id: zUUID,
})

// ── Inventory Batch Import ─────────────────────────────────────────────────

export const BatchImportSchema = z.object({
  sourceId: zUUID,
  offset: z.number().int().min(0).optional().default(0),
  mode: z.enum(["upsert", "insert", "update"]).optional().default("upsert"),
  historyId: z.string().nullable().optional().default(null),
  batch_size: z.number().int().min(50).max(1000).optional().default(500),
})
export type BatchImportInput = z.infer<typeof BatchImportSchema>

// ── Shopify Push Product ───────────────────────────────────────────────────

export const ShopifyPushProductSchema = z.object({
  store_id: zUUID,
  ean: z.string().min(1, "EAN is required").max(20),
  dry_run: z.boolean().optional().default(false),
})
export type ShopifyPushProductInput = z.infer<typeof ShopifyPushProductSchema>

// ── ML Webhook ─────────────────────────────────────────────────────────────

export const MlWebhookPayloadSchema = z.object({
  topic: z.string().min(1),
  resource: z.string().min(1),
  user_id: z.union([z.string(), z.number()]),
  application_id: z.union([z.string(), z.number()]).optional(),
  sent: z.string().optional(),
  received: z.string().optional(),
  attempts: z.number().optional(),
})
export type MlWebhookPayload = z.infer<typeof MlWebhookPayloadSchema>

// ── Azeta Import ───────────────────────────────────────────────────────────

export const AzetaImportSchema = z.object({
  source_id: z.string().optional(),
  source_name: z.string().optional(),
})
export type AzetaImportInput = z.infer<typeof AzetaImportSchema>

// ── Arnoia Stock Import ───────────────────────────────────────────────────

export const ArnoiaStockImportSchema = z.object({
  source_id: z.string().optional(),
  source_name: z.string().optional(),
  dry_run: z.boolean().optional().default(false),
})
export type ArnoiaStockImportInput = z.infer<typeof ArnoiaStockImportSchema>

// ── Cron Sync ─────────────────────────────────────────────────────────────

export const CronSyncQuerySchema = z.object({
  account_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
export type CronSyncQuery = z.infer<typeof CronSyncQuerySchema>

// ── Shopify Sync ──────────────────────────────────────────────────────────

export const ShopifySyncSchema = z.object({
  store_id: zUUID,
  full_sync: z.boolean().optional().default(false),
})
export type ShopifySyncInput = z.infer<typeof ShopifySyncSchema>

// ── Pagination ────────────────────────────────────────────────────────────

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  q: z.string().max(200).optional(),
})
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>
