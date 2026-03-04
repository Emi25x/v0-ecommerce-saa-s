# Importador PRO Anti-Timeout

Sistema de importación robusto para archivos CSV grandes (430k+ filas) sin timeouts de Vercel.

## Características

- ✅ **Anti-Timeout**: Procesa por chunks de 2000 filas, cada request <30s
- ✅ **Sin Re-descarga**: CSV se descarga UNA sola vez y se guarda en Supabase Storage
- ✅ **Resumible**: Si se interrumpe, continúa desde donde quedó
- ✅ **Cancelable**: Botón para detener la importación en cualquier momento
- ✅ **Auto-detección**: Detecta automáticamente columnas EAN/ISBN, Título, Autor, Precio, Imagen
- ✅ **Progreso en tiempo real**: Barra de progreso, velocidad (filas/s), y ETA
- ✅ **Validación**: Solo importa productos con EAN válido (13 dígitos)

## Arquitectura

### Tablas

**import_runs**: Estado de cada ejecución de importación
- `id`, `source_id`, `feed_kind`, `mode`, `status`
- `storage_path`: Ruta del CSV en Storage
- `total_rows`, `processed_rows`: Progreso
- `created_count`, `updated_count`: Contadores
- `skipped_missing_key`, `skipped_invalid_key`: Filas descartadas

**import_run_chunks** (opcional): Trazabilidad detallada por chunk

### Storage

**Bucket**: `imports`
- Privado (solo accesible con autenticación)
- Almacena cada CSV como: `imports/{source_id}/{run_id}.csv`
- Límite: 100MB por archivo

### Endpoints

1. **POST /api/inventory/import/run/start**
   - Descarga CSV, guarda en Storage, crea run
   - Input: `{ source_id, feed_kind, mode }`
   - Output: `{ ok, run_id, total_rows, storage_path }`

2. **POST /api/inventory/import/run/step**
   - Procesa 1 chunk (2000 filas) desde Storage
   - Input: `{ run_id }`
   - Output: `{ ok, status, processed_rows, created_count, continue }`

3. **POST /api/inventory/import/run/cancel**
   - Cancela importación
   - Input: `{ run_id }`
   - Output: `{ ok, status }`

4. **GET /api/inventory/import/run/status?run_id=xxx**
   - Estado actual con métricas
   - Output: `{ status, processed_rows, total_rows, speed_rows_sec, eta_sec }`

## Setup Manual Requerido

### 1. Crear Bucket en Supabase

El bucket `imports` debe crearse manualmente desde el dashboard de Supabase:

1. Ir a https://supabase.com/dashboard/project/YOUR_PROJECT/storage/buckets
2. Click en "New bucket"
3. Configurar:
   - **Name**: `imports`
   - **Public**: ❌ Deshabilitado (privado)
   - **File size limit**: `104857600` (100MB)
   - **Allowed MIME types**: `text/csv`, `text/plain`, `application/octet-stream`

4. Crear políticas de acceso (Storage Policies):

\`\`\`sql
-- Permitir uploads autenticados
CREATE POLICY "Allow authenticated uploads to imports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'imports');

-- Permitir lecturas autenticadas
CREATE POLICY "Allow authenticated reads from imports"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'imports');

-- Permitir eliminaciones autenticadas
CREATE POLICY "Allow authenticated deletes from imports"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'imports');
\`\`\`

### 2. Verificar Migración

Las tablas `import_runs` e `import_run_chunks` se crean automáticamente con el script:

\`\`\`bash
# El script ya fue ejecutado:
scripts/038_create_import_runs.sql
\`\`\`

Verificar que las tablas existen:

\`\`\`sql
SELECT * FROM import_runs LIMIT 1;
SELECT * FROM import_run_chunks LIMIT 1;
\`\`\`

## Uso

### Desde la UI

1. Ir a `/inventory/sources`
2. Click en botón **"PRO"** junto a cualquier fuente
3. Configurar modo: Create, Update, o Upsert
4. Click en **"Iniciar Importación"**
5. Esperar mientras procesa por chunks (actualización cada 2s)
6. Ver progreso en tiempo real: filas procesadas, creadas, descartadas, ETA

### Programático

\`\`\`typescript
// 1. Iniciar
const startRes = await fetch('/api/inventory/import/run/start', {
  method: 'POST',
  body: JSON.stringify({
    source_id: 'uuid-here',
    feed_kind: 'catalog',
    mode: 'upsert'
  })
})
const { run_id } = await startRes.json()

// 2. Loop de procesamiento
let continueProcessing = true
while (continueProcessing) {
  const stepRes = await fetch('/api/inventory/import/run/step', {
    method: 'POST',
    body: JSON.stringify({ run_id })
  })
  const result = await stepRes.json()
  
  console.log(`Progreso: ${result.processed_rows}/${result.total_rows}`)
  
  continueProcessing = result.continue && result.status === 'running'
  
  // Esperar 2s antes del siguiente chunk
  await new Promise(resolve => setTimeout(resolve, 2000))
}
\`\`\`

## Auto-Detección de Columnas

El sistema detecta automáticamente las columnas necesarias:

- **EAN** (obligatorio): `ean`, `ean13`, `isbn`, `isbn13`, `gtin`, `codbarras`
- **Título**: `titulo`, `title`, `descripcion`
- **Autor**: `autor`, `author`
- **Precio**: `pvp`, `precio`, `price`
- **Imagen**: `portada`, `imagen`, `image`, `url_imagen`

La detección es **case-insensitive** y **sin tildes**.

## Validaciones

- ✅ **EAN obligatorio**: Solo se importan productos con EAN o ISBN
- ✅ **Longitud EAN**: Debe ser exactamente 13 dígitos (EAN-13)
- ✅ **Normalización**: EAN se limpia (solo dígitos numéricos)
- ✅ **SKU fallback**: Si no hay SKU, se usa EAN como SKU

## Ejemplos de Fuentes

### Azeta Total (430k filas)
- Feed: Catálogo completo
- Tiempo estimado: ~15 minutos
- Chunks: 215 (2000 filas cada uno)

### Azeta Stock (50k filas)
- Feed: Solo stock
- Tiempo estimado: ~2 minutos
- Chunks: 25

### Arnoia (150k filas)
- Feed: Catálogo completo
- Tiempo estimado: ~5 minutos
- Chunks: 75

## Troubleshooting

### Error: "Bucket imports no encontrado"

Crear el bucket manualmente (ver Setup Manual arriba).

### Error: "Storage permission denied"

Verificar que las políticas de Storage estén configuradas correctamente.

### Importación lenta

- Velocidad normal: 100-200 filas/segundo
- Si es más lento, revisar conexión a Supabase
- Considerar aumentar `CHUNK_SIZE` en `/api/inventory/import/run/step/route.ts`

### Filas descartadas

Ver en UI cuántas filas fueron descartadas:
- **Sin EAN/ISBN**: Productos sin identificador válido
- **EAN inválido**: EAN con longitud != 13 dígitos

## Mejoras Futuras

- [ ] Soporte para EAN-8 (8 dígitos)
- [ ] Conversión automática ISBN-10 → ISBN-13
- [ ] Compresión gzip para archivos grandes
- [ ] Paralelización de chunks
- [ ] Limpieza automática de archivos antiguos en Storage
- [ ] Notificaciones por email al completar
