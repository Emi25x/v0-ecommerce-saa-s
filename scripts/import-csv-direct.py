import os
import requests
import csv
from io import StringIO

# Configuración de Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

print("[v0] ========================================")
print("[v0] SCRIPT DE IMPORTACIÓN DIRECTA")
print("[v0] ========================================")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("[v0] ERROR: Variables de entorno no configuradas")
    print("[v0] SUPABASE_URL:", "✓" if SUPABASE_URL else "✗")
    print("[v0] SUPABASE_SERVICE_ROLE_KEY:", "✓" if SUPABASE_KEY else "✗")
    exit(1)

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# 1. Obtener todas las fuentes activas
print("\n[v0] Obteniendo fuentes de importación...")
response = requests.get(
    f"{SUPABASE_URL}/rest/v1/import_sources?select=*",
    headers=headers
)

if response.status_code != 200:
    print(f"[v0] ERROR: No se pudieron obtener las fuentes: {response.text}")
    exit(1)

sources = response.json()
print(f"[v0] Fuentes encontradas: {len(sources)}")

for source in sources:
    print(f"\n[v0] ========================================")
    print(f"[v0] Procesando fuente: {source['name']}")
    print(f"[v0] ========================================")
    
    csv_url = source.get("url_template")
    if not csv_url:
        print(f"[v0] SKIP: Fuente sin URL configurada")
        continue
    
    print(f"[v0] Descargando CSV desde: {csv_url}")
    csv_response = requests.get(csv_url)
    
    if csv_response.status_code != 200:
        print(f"[v0] ERROR: No se pudo descargar el CSV: {csv_response.status_code}")
        continue
    
    csv_text = csv_response.text
    print(f"[v0] CSV descargado: {len(csv_text)} bytes")
    
    # Detectar separador
    first_line = csv_text.split('\n')[0]
    comma_count = first_line.count(',')
    semicolon_count = first_line.count(';')
    pipe_count = first_line.count('|')
    
    separator = ','
    if pipe_count > comma_count and pipe_count > semicolon_count:
        separator = '|'
    elif semicolon_count > comma_count:
        separator = ';'
    
    print(f"[v0] Separador detectado: {separator}")
    
    # Parsear CSV
    csv_reader = csv.DictReader(StringIO(csv_text), delimiter=separator)
    rows = list(csv_reader)
    print(f"[v0] Total de productos en CSV: {len(rows)}")
    
    column_mapping = source.get("column_mapping", {})
    print(f"[v0] Column mapping: {column_mapping}")
    
    # Crear registro de historial
    history_data = {
        "source_id": source["id"],
        "status": "running",
        "started_at": "now()",
        "products_imported": 0,
        "products_updated": 0,
        "products_failed": 0
    }
    
    history_response = requests.post(
        f"{SUPABASE_URL}/rest/v1/import_history",
        headers=headers,
        json=history_data
    )
    
    if history_response.status_code not in [200, 201]:
        print(f"[v0] ERROR: No se pudo crear el historial: {history_response.text}")
        continue
    
    history = history_response.json()[0]
    history_id = history["id"]
    print(f"[v0] Historial creado con ID: {history_id}")
    
    imported = 0
    updated = 0
    failed = 0
    
    # Procesar cada producto
    for i, row in enumerate(rows):
        try:
            # Mapear campos
            product = {}
            for db_field, csv_field in column_mapping.items():
                if csv_field in row and row[csv_field]:
                    value = row[csv_field].strip()
                    if value and value != "undefined" and value != "null":
                        # Convertir campos numéricos
                        if db_field in ["price", "stock"]:
                            try:
                                product[db_field] = float(value.replace(',', '.'))
                            except:
                                pass
                        else:
                            product[db_field] = value
            
            # Verificar SKU
            if "sku" not in product or not product["sku"]:
                failed += 1
                continue
            
            sku = product["sku"]
            
            # Verificar si el producto existe
            check_response = requests.get(
                f"{SUPABASE_URL}/rest/v1/products?sku=eq.{sku}&select=id",
                headers=headers
            )
            
            existing = check_response.json()
            
            if existing:
                # Actualizar producto existente
                update_response = requests.patch(
                    f"{SUPABASE_URL}/rest/v1/products?id=eq.{existing[0]['id']}",
                    headers=headers,
                    json=product
                )
                
                if update_response.status_code in [200, 204]:
                    updated += 1
                else:
                    print(f"[v0] ERROR actualizando SKU {sku}: {update_response.text}")
                    failed += 1
            else:
                # Insertar nuevo producto
                insert_response = requests.post(
                    f"{SUPABASE_URL}/rest/v1/products",
                    headers=headers,
                    json=product
                )
                
                if insert_response.status_code in [200, 201]:
                    imported += 1
                else:
                    print(f"[v0] ERROR insertando SKU {sku}: {insert_response.text}")
                    failed += 1
            
            # Mostrar progreso cada 100 productos
            if (i + 1) % 100 == 0:
                print(f"[v0] Progreso: {i + 1}/{len(rows)} - Importados: {imported}, Actualizados: {updated}, Fallidos: {failed}")
        
        except Exception as e:
            print(f"[v0] ERROR procesando fila {i + 1}: {str(e)}")
            failed += 1
    
    # Actualizar historial
    final_history = {
        "status": "success",
        "completed_at": "now()",
        "products_imported": imported,
        "products_updated": updated,
        "products_failed": failed
    }
    
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/import_history?id=eq.{history_id}",
        headers=headers,
        json=final_history
    )
    
    print(f"\n[v0] ========================================")
    print(f"[v0] IMPORTACIÓN COMPLETADA: {source['name']}")
    print(f"[v0] Total: {len(rows)}")
    print(f"[v0] Importados: {imported}")
    print(f"[v0] Actualizados: {updated}")
    print(f"[v0] Fallidos: {failed}")
    print(f"[v0] ========================================")

print("\n[v0] ========================================")
print("[v0] TODAS LAS IMPORTACIONES COMPLETADAS")
print("[v0] ========================================")
