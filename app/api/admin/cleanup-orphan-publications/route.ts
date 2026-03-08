import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/admin/cleanup-orphan-publications
 * Elimina todos los registros de ml_publications que NO están vinculados a un producto local
 * (donde product_id IS NULL)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Primero contar cuántos hay
    const { data: beforeCount, error: countError } = await supabase
      .from('ml_publications')
      .select('id', { count: 'exact', head: true })
      .is('product_id', true)
    
    if (countError) {
      return NextResponse.json({ error: 'Error contando huérfanos', details: countError }, { status: 500 })
    }
    
    const orphanCount = beforeCount || 0
    console.log(`[v0] Cleanup: Encontrados ${orphanCount} registros huérfanos sin vincular`)
    
    // Eliminar los huérfanos
    const { error: deleteError, data: deletedRows } = await supabase
      .from('ml_publications')
      .delete()
      .is('product_id', true)
    
    if (deleteError) {
      return NextResponse.json({ error: 'Error eliminando huérfanos', details: deleteError }, { status: 500 })
    }
    
    // Contar los restantes
    const { data: afterCount, error: afterCountError } = await supabase
      .from('ml_publications')
      .select('id', { count: 'exact', head: true })
    
    if (afterCountError) {
      return NextResponse.json({ error: 'Error contando después', details: afterCountError }, { status: 500 })
    }
    
    const remainingCount = afterCount || 0
    
    console.log(`[v0] Cleanup completado: eliminados ${orphanCount}, quedan ${remainingCount} vinculados`)
    
    return NextResponse.json({
      success: true,
      orphans_deleted: orphanCount,
      publications_remaining: remainingCount,
      message: `Se eliminaron ${orphanCount} publicaciones sin vincular. Quedan ${remainingCount} asociadas a productos.`
    })
    
  } catch (error: any) {
    console.error('[v0] Cleanup error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
