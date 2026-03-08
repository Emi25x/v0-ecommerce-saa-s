import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  try {
    // Verificar el último import run de Arnoia Act
    const { data: lastRun, error: runError } = await supabase
      .from('import_runs')
      .select('*')
      .eq('feed_kind', 'arnoia_act')
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    if (runError) {
      return NextResponse.json({
        error: 'No hay import runs de Arnoia Act',
        details: runError.message
      })
    }

    // Contar productos en la BD
    const { count: productsCount, error: productsError } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })

    // Contar supplier_catalog_items de Arnoia
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id')
      .eq('code', 'ARNOIA_ACT')
      .single()

    const { count: arnoiaItemsCount, error: arnoiaError } = await supabase
      .from('supplier_catalog_items')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', suppliers?.id)

    // Verificar si hay stock de Arnoia
    const { data: arnoiaStock } = await supabase
      .from('supplier_stock')
      .select('id, quantity', { count: 'exact' })
      .limit(5)
      .eq('supplier_id', suppliers?.id)

    return NextResponse.json({
      lastRun: {
        status: lastRun?.status,
        started_at: lastRun?.started_at,
        finished_at: lastRun?.finished_at,
        total_rows: lastRun?.total_rows,
        created_count: lastRun?.created_count,
        updated_count: lastRun?.updated_count,
        error_count: lastRun?.error_count,
      },
      database_state: {
        total_products: productsCount,
        arnoia_items_in_catalog: arnoiaItemsCount,
        arnoia_stock_entries: arnoiaStock?.length,
        avg_quantity: arnoiaStock?.length > 0
          ? Math.round(arnoiaStock.reduce((sum, s) => sum + (s.quantity || 0), 0) / arnoiaStock.length)
          : 0,
      },
      recommendation: 
        lastRun?.status === 'completed' && arnoiaItemsCount > 0
          ? '✅ Importación completada exitosamente'
          : lastRun?.status === 'completed' && arnoiaItemsCount === 0
            ? '⚠️ Importación completada pero sin items guardados (posible problema de matching)'
            : '❌ Importación no completada',
    })
  } catch (error: any) {
    return NextResponse.json({
      error: 'Error verificando importación',
      details: error.message
    }, { status: 500 })
  }
}
