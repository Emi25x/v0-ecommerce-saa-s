import { createClient } from '@/lib/db/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const error_description = requestUrl.searchParams.get('error_description')
  const origin = requestUrl.origin

  // Si hay error en el callback, redirigir a página de error
  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(error)}&description=${encodeURIComponent(error_description || '')}`
    )
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      return NextResponse.redirect(
        `${origin}/auth/error?error=exchange_failed&description=${encodeURIComponent(exchangeError.message)}`
      )
    }
  }

  // Redirect to dashboard after login
  return NextResponse.redirect(`${origin}/`)
}
