-- Add mode column to import_history table
-- This column stores the import mode: 'full', 'partial', 'stock', 'update', etc.

-- 1) Add the mode column
ALTER TABLE public.import_history
ADD COLUMN IF NOT EXISTS mode text;

-- 2) Add index for better query performance
CREATE INDEX IF NOT EXISTS import_history_mode_idx ON public.import_history(mode);

-- 3) Add comment for documentation
COMMENT ON COLUMN public.import_history.mode IS 'Import mode: full, partial, stock, update, etc.';

-- 4) Optional: Set default value for existing rows (can be NULL)
-- UPDATE public.import_history SET mode = 'full' WHERE mode IS NULL;
