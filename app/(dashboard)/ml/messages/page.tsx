"use client"

import { MessageSquare } from "lucide-react"

export default function MLMessagesPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <div className="rounded-full bg-muted/30 p-6">
        <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Mensajes ML</h1>
        <p className="text-muted-foreground max-w-sm">
          La bandeja de mensajes de MercadoLibre estará disponible próximamente.
        </p>
      </div>
      <p className="text-xs text-muted-foreground/50">Próximamente</p>
    </div>
  )
}
