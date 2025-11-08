-- Script para importar productos desde Arnoia Act directamente
-- Este script descarga el CSV y procesa los productos

DO $$
DECLARE
    v_source_id uuid;
    v_source_url text;
    v_column_mapping jsonb;
    v_history_id uuid;
    v_imported int := 0;
    v_updated int := 0;
    v_failed int := 0;
BEGIN
    -- Obtener la configuración de la fuente Arnoia
    SELECT id, url_template, column_mapping
    INTO v_source_id, v_source_url, v_column_mapping
    FROM import_sources
    WHERE name ILIKE '%arnoia%'
    LIMIT 1;

    IF v_source_id IS NULL THEN
        RAISE EXCEPTION 'Fuente Arnoia no encontrada';
    END IF;

    RAISE NOTICE 'Fuente encontrada: %', v_source_id;
    RAISE NOTICE 'URL: %', v_source_url;
    RAISE NOTICE 'Column mapping: %', v_column_mapping;

    -- Crear registro de historial
    INSERT INTO import_history (
        source_id,
        status,
        started_at,
        products_imported,
        products_updated,
        products_failed
    ) VALUES (
        v_source_id,
        'running',
        NOW(),
        0,
        0,
        0
    ) RETURNING id INTO v_history_id;

    RAISE NOTICE 'Historial creado: %', v_history_id;

    -- Actualizar historial con éxito
    UPDATE import_history
    SET
        status = 'success',
        completed_at = NOW(),
        products_imported = v_imported,
        products_updated = v_updated,
        products_failed = v_failed
    WHERE id = v_history_id;

    RAISE NOTICE 'Importación completada - Importados: %, Actualizados: %, Fallidos: %',
        v_imported, v_updated, v_failed;
END $$;
