-- Index for warehouse stock queries filtering by stock_by_source JSONB keys.
-- Without this index, queries with .or(stock_by_source->>key.not.is.null) do
-- a full table scan on 220K+ products, causing statement timeouts on page 2+.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_stock_by_source_gin
  ON products USING gin (stock_by_source jsonb_path_ops);

-- Also create a partial index for the common query pattern: stock > 0
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_stock_gt0_id
  ON products (stock DESC, id ASC) WHERE stock > 0;
