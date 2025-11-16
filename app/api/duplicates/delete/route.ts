import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export const maxDuration = 300

export async function POST() {
  try {
    console.log('[v0] 🗑️ Iniciando eliminación de duplicados...')
    
    const supabase = await createClient()
    
    console.log('[v0] 🚀 Ejecutando función SQL delete_duplicate_products()...')
    const { data: sqlResult, error: sqlError } = await supabase.rpc('delete_duplicate_products')
    
    if (sqlError && (sqlError.code === 'PGRST202' || sqlError.code === '42883')) {
      console.log('[v0] ⚠️ Función SQL no existe, notificando al usuario...')
      return NextResponse.json({
        deletedCount: 0,
        success: false,
        error: 'Funciones SQL no configuradas',
        instructions: 'Por favor ejecuta el script SQL "EJECUTAR_PRIMERO_crear_funciones.sql" que se encuentra en la carpeta scripts/ usando el SQL Editor de Supabase para habilitar la eliminación automática de duplicados.',
        sqlEditorUrl: 'https://supabase.com/dashboard/project/_/sql/new',
        needsSQLSetup: true
      }, { status: 400 })
    }
    
    if (!sqlError && sqlResult) {
      console.log('[v0] ✅ Eliminación SQL completada:', sqlResult)
      return NextResponse.json(sqlResult)
    }
    
    // Si hay otro tipo de error, lanzarlo
    if (sqlError) {
      throw sqlError
    }
    
    // Este código ya no debería ejecutarse porque devolvemos error arriba
    return NextResponse.json({
      deletedCount: 0,
      success: false,
      error: 'No se pudo eliminar duplicados'
    }, { status: 500 })
    
  } catch (error: any) {
    console.error('[v0] ❌ Error en eliminación:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Error al eliminar duplicados',
        deletedCount: 0,
        success: false
      },
      { status: 500 }
    )
  }
}
