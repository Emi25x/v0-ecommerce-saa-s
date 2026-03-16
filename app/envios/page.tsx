"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefreshCw, Truck, Package, Clock, CheckCircle, XCircle, Settings, Plus } from "lucide-react"

interface ShipmentRow {
  id: string
  tracking_number: string | null
  carrier_slug: string | null
  status: string
  destination: { name?: string; city?: string; province?: string } | null
  created_at: string
  updated_at: string
}

interface CarrierRow {
  id: string
  name: string
  slug: string
  active: boolean
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:    { label: "Pendiente",    variant: "secondary" },
  in_transit: { label: "En tránsito",  variant: "default" },
  delivered:  { label: "Entregado",    variant: "outline" },
  failed:     { label: "Fallido",      variant: "destructive" },
  returned:   { label: "Devuelto",     variant: "destructive" },
}

export default function EnviosPage() {
  const [shipments, setShipments]   = useState<ShipmentRow[]>([])
  const [carriers, setCarriers]     = useState<CarrierRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [stats, setStats]           = useState({ total: 0, in_transit: 0, delivered: 0, pending: 0 })

  async function load() {
    setLoading(true)
    try {
      const [sRes, cRes] = await Promise.all([
        fetch("/api/envios/shipments?limit=20"),
        fetch("/api/envios/carriers"),
      ])
      if (sRes.ok) {
        const { data } = await sRes.json()
        setShipments(data ?? [])
        const rows: ShipmentRow[] = data ?? []
        setStats({
          total:      rows.length,
          in_transit: rows.filter(r => r.status === "in_transit").length,
          delivered:  rows.filter(r => r.status === "delivered").length,
          pending:    rows.filter(r => r.status === "pending").length,
        })
      }
      if (cRes.ok) {
        const { data } = await cRes.json()
        setCarriers(data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Envíos</h1>
          <p className="text-sm text-muted-foreground">Gestión de envíos con transportistas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button size="sm" asChild>
            <Link href="/envios/nuevo">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo envío
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/envios/cotizador">
              <Truck className="mr-2 h-4 w-4" />
              Cotizador
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/envios/transportistas">
              <Settings className="mr-2 h-4 w-4" />
              Transportistas
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>En tránsito</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{stats.in_transit}</CardTitle>
          </CardHeader>
          <CardContent>
            <Truck className="h-4 w-4 text-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Entregados</CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.delivered}</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pendientes</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{stats.pending}</CardTitle>
          </CardHeader>
          <CardContent>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardContent>
        </Card>
      </div>

      {/* Carriers activos */}
      {carriers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transportistas configurados</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {carriers.map(c => (
              <Link key={c.id} href={`/envios/transportistas/${c.slug}`}>
                <Badge variant={c.active ? "default" : "secondary"} className="cursor-pointer text-sm px-3 py-1">
                  <Truck className="mr-1.5 h-3 w-3" />
                  {c.name}
                  {!c.active && <span className="ml-1 opacity-60">(inactivo)</span>}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabla de envíos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos envíos</CardTitle>
          <CardDescription>Los 20 envíos más recientes</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : shipments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No hay envíos registrados aún.</p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/envios/transportistas">Configurar transportistas</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nro. guía</TableHead>
                  <TableHead>Transportista</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map(s => {
                  const st = STATUS_LABELS[s.status] ?? { label: s.status, variant: "secondary" as const }
                  return (
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-mono text-sm">
                        <Link href={`/envios/${s.id}`} className="hover:underline">
                          {s.tracking_number ?? <span className="text-muted-foreground">—</span>}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">{s.carrier_slug ?? "—"}</TableCell>
                      <TableCell>
                        {s.destination
                          ? `${s.destination.name ?? ""} — ${s.destination.city ?? ""}, ${s.destination.province ?? ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(s.created_at).toLocaleDateString("es-AR")}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
