import os
from supabase import create_client

# Obtener credenciales de Supabase
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not supabase_url or not supabase_key:
    print("Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos")
    exit(1)

# Crear cliente de Supabase
supabase = create_client(supabase_url, supabase_key)

# SQL para crear las tablas
sql_statements = [
    """
    CREATE TABLE IF NOT EXISTS competition_tracking (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID REFERENCES products(id) ON DELETE CASCADE,
      ml_listing_id UUID REFERENCES ml_listings(id) ON DELETE CASCADE,
      search_query TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS competition_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tracking_id UUID REFERENCES competition_tracking(id) ON DELETE CASCADE,
      competitor_ml_id TEXT NOT NULL,
      competitor_title TEXT,
      competitor_price NUMERIC(10, 2),
      competitor_available_quantity INTEGER,
      competitor_sold_quantity INTEGER,
      competitor_listing_type TEXT,
      competitor_seller_id TEXT,
      competitor_permalink TEXT,
      competitor_thumbnail TEXT,
      position_in_search INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS price_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tracking_id UUID REFERENCES competition_tracking(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL,
      threshold_value NUMERIC(10, 2),
      is_active BOOLEAN DEFAULT true,
      last_triggered_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_competition_tracking_product ON competition_tracking(product_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_competition_tracking_listing ON competition_tracking(ml_listing_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_competition_snapshots_tracking ON competition_snapshots(tracking_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_competition_snapshots_created ON competition_snapshots(created_at DESC);
    """
]

print("Creando tablas de competencia...")

try:
    # Ejecutar cada statement SQL
    for i, sql in enumerate(sql_statements, 1):
        print(f"Ejecutando statement {i}/{len(sql_statements)}...")
        result = supabase.rpc('exec_sql', {'sql': sql}).execute()
        print(f"✓ Statement {i} ejecutado correctamente")
    
    print("\n✅ Todas las tablas de competencia fueron creadas exitosamente!")
    
except Exception as e:
    print(f"\n❌ Error al crear las tablas: {str(e)}")
    exit(1)
