-- Add notes column to warehouses table
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS notes text;
