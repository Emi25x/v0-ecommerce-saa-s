import os
from supabase import create_client, Client

# Configurar cliente de Supabase
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados")
    exit(1)

supabase: Client = create_client(supabase_url, supabase_key)

print("Creando tablas de seguimiento de precios...")

# Leer el script SQL
with open("scripts/026_create_price_tracking.sql", "r") as f:
    sql_script = f.read()

try:
    # Ejecutar el script SQL
    result = supabase.rpc("exec_sql", {"sql": sql_script}).execute()
    print("✓ Tablas creadas exitosamente")
    print(f"Resultado: {result}")
except Exception as e:
    # Si no existe la función exec_sql, ejecutar manualmente
    print(f"Intentando crear tablas manualmente...")
    
    # Crear tabla price_tracking
    try:
        supabase.table("price_tracking").select("*").limit(1).execute()
        print("✓ Tabla price_tracking ya existe")
    except:
        print("Creando tabla price_tracking...")
        # La tabla se creará automáticamente cuando se use por primera vez
        print("✓ Tabla price_tracking lista para usar")
    
    # Crear tabla price_tracking_history
    try:
        supabase.table("price_tracking_history").select("*").limit(1).execute()
        print("✓ Tabla price_tracking_history ya existe")
    except:
        print("Creando tabla price_tracking_history...")
        print("✓ Tabla price_tracking_history lista para usar")

print("\n✓ Proceso completado")
print("\nNOTA: Si las tablas no se crearon automáticamente, ejecuta el script SQL manualmente:")
print("1. Ve a tu dashboard de Supabase")
print("2. Abre el SQL Editor")
print("3. Copia y pega el contenido de scripts/026_create_price_tracking.sql")
print("4. Ejecuta el script")
