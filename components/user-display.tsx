'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { User as UserIcon } from 'lucide-react'

export function UserDisplay() {
  const [user, setUser] = useState<User | null>(null)
  const supabase = createClient()

  useEffect(() => {
    // Obtener usuario actual
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  if (!user) return null

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
      <UserIcon className="h-4 w-4" />
      <span className="truncate">{user.email}</span>
    </div>
  )
}
