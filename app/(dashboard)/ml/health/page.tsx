"use client"

import { Activity } from "lucide-react"

export default function MLHealthPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <div className="rounded-full bg-muted/30 p-6">
        <Activity className="h-12 w-12 text-muted-foreground/50" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Salud / Exposición</h1>
        <p className="text-muted-foreground max-w-sm">
          Monitoreo de salud y exposición de tus publicaciones en MercadoLibre. Disponible próximamente.
        </p>
      </div>
      <p className="text-xs text-muted-foreground/50">Próximamente</p>
    </div>
  )
}
