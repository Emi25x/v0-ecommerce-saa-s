"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Truck, Settings, Plus, CheckCircle, XCircle } from "lucide-react"

interface Carrier {
  id: string
  name: string
  slug: string
  description: string | null
  active: boolean
  config: Record<string, any>
  created_at: string
}

export default function TransportistasPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [loading, setLoading]   = useState(true)

  async function load() {
    setLoading(true)
    const res = await fetch("/api/envios/carriers")
    if (res.ok) {
      const { data } = await res.json()
      setCarriers(data ?? [])
    }
    setLoading(false)
  }

  async function toggleActive(carrier: Carrier) {
    await fetch(`/api/envios/carriers/${carrier.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !carrier.active }),
    })
    load()
  }

  useEffect(() => { load() }, [])

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transportistas</h1>
          <p className="text-sm text-muted-foreground">Configurá y activá los carriers para tus envíos</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/envios">← Volver a Envíos</Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {carriers.map(carrier => (
            <Card key={carrier.id} className={carrier.active ? "" : "opacity-60"}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">{carrier.name}</CardTitle>
                  </div>
                  <Badge variant={carrier.active ? "default" : "secondary"}>
                    {carrier.active ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                {carrier.description && (
                  <CardDescription className="text-xs">{carrier.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {carrier.config?.base_url && (
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {carrier.config.base_url}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1" asChild>
                    <Link href={`/envios/transportistas/${carrier.slug}`}>
                      <Settings className="mr-1.5 h-3.5 w-3.5" />
                      Configurar
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant={carrier.active ? "destructive" : "default"}
                    className="flex-1"
                    onClick={() => toggleActive(carrier)}
                  >
                    {carrier.active ? (
                      <><XCircle className="mr-1.5 h-3.5 w-3.5" />Desactivar</>
                    ) : (
                      <><CheckCircle className="mr-1.5 h-3.5 w-3.5" />Activar</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Placeholder para futuros carriers */}
          <Card className="border-dashed opacity-50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base text-muted-foreground">Próximamente</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Andreani, Correo Argentino, OCA, Mercado Envíos Flex…
              </CardDescription>
            </CardHeader>
          </Card>
          {carriers.length === 0 && (
            <Card className="border-dashed col-span-full">
              <CardHeader>
                <CardDescription className="text-sm">
                  No hay transportistas en la base de datos. Ejecutá las migraciones{" "}
                  <code className="font-mono text-xs bg-muted px-1 rounded">20260312_create_carriers.sql</code>{" "}
                  y{" "}
                  <code className="font-mono text-xs bg-muted px-1 rounded">20260313_add_cabify_carrier.sql</code>{" "}
                  en Supabase SQL Editor.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
