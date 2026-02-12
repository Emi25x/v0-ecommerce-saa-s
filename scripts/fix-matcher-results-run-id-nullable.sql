-- Hacer run_id nullable en matcher_results
-- Ya no usamos tabla matcher_runs, el tracking está en ml_matcher_progress

ALTER TABLE matcher_results 
  ALTER COLUMN run_id DROP NOT NULL;

COMMENT ON COLUMN matcher_results.run_id IS 'Opcional - asocia result a una corrida específica si existe';
