import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export const maxDuration = 300

export async function GET() {
  try {
    console.log('[v0] 🔍 Iniciando análisis de duplicados...')
    
    const supabase = await createClient()
    
    console.log('[v0] 🚀 Ejecutando función SQL analyze_duplicate_skus()...')
    const { data: sqlResult, error: sqlError } = await supabase.rpc('analyze_duplicate_skus')
    
    if (sqlError && (sqlError.code === 'PGRST202' || sqlError.code === '42883')) {
      console.log('[v0] ⚠️ Función SQL no existe, notificando al usuario...')
      return NextResponse.json({
        totalProducts: 0,
        totalDuplicateSKUs: 0,
        totalDuplicateProducts: 0,
        method: 'error',
        error: 'Funciones SQL no configuradas',
        instructions: 'Por favor ejecuta el script SQL "EJECUTAR_PRIMERO_crear_funciones.sql" que se encuentra en la carpeta scripts/ usando el SQL Editor de Supabase para habilitar el análisis completo de duplicados.',
        sqlEditorUrl: 'https://supabase.com/dashboard/project/_/sql/new',
        needsSQLSetup: true
      })
    }
    
    if (!sqlError && sqlResult) {
      console.log('[v0] ✅ Análisis SQL completado exitosamente:', sqlResult)
      return NextResponse.json(sqlResult)
    }
    
    // Si hay otro tipo de error, lanzarlo
    if (sqlError) {
      throw sqlError
    }
    
    // Este código ya no debería ejecutarse porque devolvemos error arriba
    return NextResponse.json({
      totalProducts: 0,
      totalDuplicateSKUs: 0,
      totalDuplicateProducts: 0,
      method: 'error',
      error: 'No se pudo analizar la base de datos'
    })
    
  } catch (error: any) {
    console.error('[v0] ❌ Error en análisis:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Error al analizar duplicados',
        totalProducts: 0,
        totalDuplicateSKUs: 0,
        totalDuplicateProducts: 0
      },
      { status: 500 }
    )
  }
}
