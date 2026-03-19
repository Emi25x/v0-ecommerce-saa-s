import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export async function POST(request: NextRequest) {
  try {
    // Verificar CRON_SECRET
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!authHeader || !cronSecret || authHeader.replace("Bearer ", "") !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminClient()

    // 1. Agregar columna stock_by_source si no existe
    await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE products 
        ADD COLUMN IF NOT EXISTS stock_by_source JSONB DEFAULT '{}'::jsonb;
      `,
    })

    // 2. Migrar stock actual a legacy si está vacío
    const { error: migrateError } = await supabase
      .from("products")
      .update({
        stock_by_source: (supabase as any).raw(`jsonb_build_object('legacy', COALESCE(stock, 0))`),
      })
      .eq("stock_by_source", "{}")
      .not("stock", "is", null)

    // 3. Crear función para calcular stock_total
    await supabase.rpc("exec_sql", {
      sql: `
        CREATE OR REPLACE FUNCTION calculate_stock_total(stock_sources JSONB)
        RETURNS INTEGER AS $$
        DECLARE
          total INTEGER := 0;
          source_key TEXT;
          source_value JSONB;
        BEGIN
          FOR source_key, source_value IN SELECT * FROM jsonb_each(stock_sources)
          LOOP
            IF jsonb_typeof(source_value) = 'number' THEN
              total := total + (source_value::TEXT)::INTEGER;
            END IF;
          END LOOP;
          RETURN total;
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
      `,
    })

    // 4. Crear función de trigger
    await supabase.rpc("exec_sql", {
      sql: `
        CREATE OR REPLACE FUNCTION sync_stock_total()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.stock := calculate_stock_total(NEW.stock_by_source);
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `,
    })

    // 5. Crear trigger
    await supabase.rpc("exec_sql", {
      sql: `
        DROP TRIGGER IF EXISTS trigger_sync_stock_total ON products;
        CREATE TRIGGER trigger_sync_stock_total
          BEFORE INSERT OR UPDATE OF stock_by_source
          ON products
          FOR EACH ROW
          EXECUTE FUNCTION sync_stock_total();
      `,
    })

    // 6. Crear índice GIN
    await supabase.rpc("exec_sql", {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_products_stock_by_source 
        ON products USING gin (stock_by_source);
      `,
    })

    return NextResponse.json({
      success: true,
      message: "Migration completed successfully",
    })
  } catch (error: any) {
    console.error("[MIGRATE] Error:", error)
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 500 },
    )
  }
}
