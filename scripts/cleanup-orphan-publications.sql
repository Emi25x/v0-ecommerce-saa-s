-- Limpiar publicaciones sin product_id (no vinculadas a la base de datos local)
DELETE FROM ml_publications
WHERE product_id IS NULL;

-- Verificar que quedaron solo las vinculadas
SELECT COUNT(*) as total_publications, 
       COUNT(CASE WHEN product_id IS NOT NULL THEN 1 END) as with_product,
       COUNT(CASE WHEN product_id IS NULL THEN 1 END) as without_product
FROM ml_publications;
