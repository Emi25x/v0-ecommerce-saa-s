"use client"

import { ShieldCheck } from "lucide-react"

export default function MLModerationsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <div className="rounded-full bg-muted/30 p-6">
        <ShieldCheck className="h-12 w-12 text-muted-foreground/50" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Moderaciones</h1>
        <p className="text-muted-foreground max-w-sm">
          Panel de moderaciones y acciones requeridas por MercadoLibre. Disponible próximamente.
        </p>
      </div>
      <p className="text-xs text-muted-foreground/50">Próximamente</p>
    </div>
  )
}
