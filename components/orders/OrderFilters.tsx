"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { MLConnectionStatus } from "@/components/mercadolibre/connection-status"
import { LastUpdated } from "@/components/shared/last-updated"
import {
  RefreshCw,
  Download,
  Check,
  ChevronDown,
  Lightbulb,
  Search,
} from "lucide-react"
import type {
  OrderFiltersState,
  GeneralStatusCounts,
  AvailabilityCounts,
  MlAccount,
} from "@/components/orders/types"

interface OrderFiltersProps {
  orders: any[]
  totalOrders: number
  loading: boolean
  mlAccounts: Record<string, MlAccount>
  selectedAccount: string
  setSelectedAccount: (v: string) => void
  filters: OrderFiltersState
  setFilters: (fn: OrderFiltersState | ((prev: OrderFiltersState) => OrderFiltersState)) => void
  advancedFiltersOpen: boolean
  setAdvancedFiltersOpen: (v: boolean) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  lastUpdated: Date | null
  fetchOrders: () => void
  generalStatusCounts: GeneralStatusCounts
  availabilityCounts: AvailabilityCounts
}

export function OrderFilters({
  orders,
  totalOrders,
  loading,
  mlAccounts,
  selectedAccount,
  setSelectedAccount,
  filters,
  setFilters,
  advancedFiltersOpen,
  setAdvancedFiltersOpen,
  searchQuery,
  setSearchQuery,
  lastUpdated,
  fetchOrders,
  generalStatusCounts,
  availabilityCounts,
}: OrderFiltersProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Ventas y Ordenes
          </h2>
          <p className="text-base text-muted-foreground">
            {orders.length > 0 ? (
              <>
                <span className="font-semibold text-foreground">{totalOrders.toLocaleString()}</span> ordenes en
                total
              </>
            ) : (
              "Gestiona tus ventas de Mercado Libre"
            )}
            {selectedAccount !== "all" &&
              mlAccounts[selectedAccount] && (
                <span className="ml-2">
                  {" "}
                  <span className="font-medium">
                    {mlAccounts[selectedAccount]?.nickname || "Cuenta seleccionada"}
                  </span>
                </span>
              )}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={fetchOrders}
            disabled={loading}
            variant="outline"
            className="shadow-sm hover:shadow-md transition-shadow bg-transparent"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button variant="outline" className="shadow-sm hover:shadow-md transition-shadow bg-transparent">
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Account selector */}
      <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Label className="text-sm font-semibold text-foreground">Filtrar por cuenta:</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="w-[300px] shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="font-medium">Todas las cuentas</span> ({Object.keys(mlAccounts).length})
                  </SelectItem>
                  {Object.entries(mlAccounts).map(([id, account]) => (
                    <SelectItem key={id} value={id}>
                      {account.nickname || id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {Object.keys(mlAccounts).length === 0 && (
                <Button variant="outline" size="sm" asChild className="shadow-sm bg-transparent">
                  <a href="/integrations">Conectar Cuenta</a>
                </Button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <LastUpdated timestamp={lastUpdated} isLoading={loading} onRefresh={fetchOrders} />
              <MLConnectionStatus accountId={selectedAccount} onRefresh={fetchOrders} refreshing={loading} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Time period + Advanced filters */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30">
            <CardTitle className="text-base font-semibold">Periodo de Tiempo</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-2">
              {(["1month", "2months", "6months", "all"] as const).map((tf) => {
                const labels: Record<string, string> = {
                  "1month": "1 mes",
                  "2months": "2 meses",
                  "6months": "6 meses",
                  all: "Todas",
                }
                return (
                  <Button
                    key={tf}
                    variant={filters.timeFilter === tf ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilters({ ...filters, timeFilter: tf })}
                    className="shadow-sm"
                  >
                    {filters.timeFilter === tf && <Check className="mr-2 h-4 w-4" />}
                    {labels[tf]}
                  </Button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30">
            <CardTitle className="text-base font-semibold">Filtro Avanzado</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Collapsible open={advancedFiltersOpen} onOpenChange={setAdvancedFiltersOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between bg-transparent">
                  Filtros adicionales
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${advancedFiltersOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Rango de fechas especifico</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Desde</Label>
                      <Input
                        type="date"
                        value={filters.date_from}
                        onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Hasta</Label>
                      <Input
                        type="date"
                        value={filters.date_to}
                        onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Estado de orden</Label>
                  <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="confirmed">Confirmado</SelectItem>
                      <SelectItem value="payment_required">Pago requerido</SelectItem>
                      <SelectItem value="payment_in_process">Pago en proceso</SelectItem>
                      <SelectItem value="paid">Pagado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                      <SelectItem value="invalid">Invalido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Cuenta de Mercado Libre</Label>
                  <Select value={filters.account} onValueChange={(v) => setFilters({ ...filters, account: v })}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {Object.entries(mlAccounts).map(([id, account]) => (
                        <SelectItem key={id} value={id}>
                          {account.nickname || id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>

      {/* General status filter */}
      <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="bg-gradient-to-r from-muted/30 to-muted/10">
          <CardTitle className="text-base font-semibold">Filtro por Estado de Orden</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por orden, cliente, producto o SKU..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                if (e.target.value) {
                  setFilters({
                    ...filters,
                    generalStatus: "all",
                    availability: "all",
                  })
                }
              }}
              className="pl-10 shadow-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { key: "all", label: "Todas", count: generalStatusCounts.all },
              { key: "delivered", label: "Entregadas", count: generalStatusCounts.delivered },
              { key: "toAgree", label: "Acordar entrega", count: generalStatusCounts.toAgree },
              { key: "returned", label: "Devoluciones", count: generalStatusCounts.returned },
              { key: "cancelled", label: "Canceladas", count: generalStatusCounts.cancelled },
              { key: "waiting", label: "Esperando disponibilidad", count: generalStatusCounts.waiting },
              { key: "con_reclamo", label: "Con reclamo", count: generalStatusCounts.withClaim },
              { key: "in_transit", label: "En camino", count: generalStatusCounts.in_transit },
              { key: "delayed", label: "Demoradas", count: generalStatusCounts.delayed },
              { key: "ready", label: "Listas para enviar", count: generalStatusCounts.ready },
              { key: "pending_payment", label: "Pendientes de pago", count: generalStatusCounts.pending_payment },
              { key: "delivery_issues", label: "Problemas de entrega", count: generalStatusCounts.delivery_issues },
              { key: "pending", label: "Pendientes", count: generalStatusCounts.pending },
            ] as const).map(({ key, label, count }) => (
              <Button
                key={key}
                variant={filters.generalStatus === key ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters((prev) => ({ ...prev, generalStatus: key }))}
                className="rounded-full"
              >
                {filters.generalStatus === key && <Check className="mr-2 h-4 w-4" />}
                {label} ({count})
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Availability filter */}
      <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="bg-gradient-to-r from-muted/30 to-muted/10">
          <CardTitle className="text-base font-semibold">Pendientes de entrega (Disponibilidad)</CardTitle>
          <CardDescription className="mt-1">
            Ordenes que requieren que tengas el producto disponible
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2">
            {([
              { key: "all", label: "Todas", count: availabilityCounts.all, colorClass: "" },
              { key: "today", label: "Listas para enviar", count: availabilityCounts.today, colorClass: "border-green-500 text-green-500 hover:bg-green-500/10" },
              { key: "twentyFourHours", label: "en 24 horas", count: availabilityCounts.twentyFourHours, colorClass: "border-orange-500 text-orange-500 hover:bg-orange-500/10" },
              { key: "fortyEightHours", label: "48 horas", count: availabilityCounts.fortyEightHours, colorClass: "border-orange-500 text-orange-500 hover:bg-orange-500/10" },
              { key: "lastWeek", label: "Ultima semana", count: availabilityCounts.lastWeek, colorClass: "border-blue-500 text-blue-500 hover:bg-blue-500/10" },
              { key: "rest", label: "Mas de 7 dias", count: availabilityCounts.rest, colorClass: "border-green-500 text-green-500 hover:bg-green-500/10" },
            ] as const).map(({ key, label, count, colorClass }) => (
              <Button
                key={key}
                variant={filters.availability === key ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters((prev) => ({ ...prev, availability: key }))}
                className={`shadow-sm ${count > 0 ? colorClass : ""}`}
              >
                {filters.availability === key && <Check className="mr-2 h-4 w-4" />}
                {label} ({count})
              </Button>
            ))}
          </div>
          {(availabilityCounts.today > 0 || availabilityCounts.twentyFourHours > 0) && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-500/10 p-3 text-sm">
              <Lightbulb className="h-5 w-5 flex-shrink-0 text-green-500" />
              <p className="text-green-600">
                <span className="font-semibold">Tip:</span> Las ordenes "Listas para enviar" estan disponibles
                para despachar. Las de "24 horas" son urgentes.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
