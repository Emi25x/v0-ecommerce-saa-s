"use client"

import type React from "react"

export function MigrationProvider({ children }: { children: React.ReactNode }) {
  // Simplemente renderizar los children sin verificar migraciones
  return <>{children}</>
}
