"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Filters } from "@/components/competition/types"
import { getCompetitionStatusText } from "@/components/competition/utils"

interface CompetitionFiltersProps {
  mlAccounts: any[]
  selectedAccount: string
  setSelectedAccount: (value: string) => void
  filters: Filters
  setFilters: (filters: Filters) => void
  searchQuery: string
  setSearchQuery: (value: string) => void
  sortBy: string
  setSortBy: (value: string) => void
}

export function CompetitionFilters({
  mlAccounts,
  selectedAccount,
  setSelectedAccount,
  filters,
  setFilters,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
}: CompetitionFiltersProps) {
  return (
    <>
      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">ℹ️ Guía de Estados de Competencia</h3>
            <div className="grid gap-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-900">🏆 Ganando:</span>
                <span className="text-gray-700">Tu publicación aparece primero en la página del producto</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-900">❌ Perdiendo:</span>
                <span className="text-gray-700">
                  Otra publicación aparece primero. Revisa las oportunidades de mejora
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-900">📋 Listado:</span>
                <span className="text-gray-700">Está en catálogo pero sin competencia activa</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-900">✨ Oportunidades:</span>
                <span className="text-gray-700">
                  Mejoras disponibles (envío gratis, cuotas, etc.) para ganar posición
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label>Cuenta:</Label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las cuentas ({mlAccounts.length})</SelectItem>
                {mlAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.nickname || account.ml_user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Filtros Avanzados */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros Avanzados</CardTitle>
          <CardDescription>Filtra tus publicaciones por estado, catálogo, competencia y más</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                  <SelectItem value="closed">Cerrado</SelectItem>
                  <SelectItem value="under_review">En Revisión</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Catálogo</Label>
              <Select
                value={filters.catalog_listing}
                onValueChange={(v) => setFilters({ ...filters, catalog_listing: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Solo Catálogo</SelectItem>
                  <SelectItem value="false">No Catálogo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estado de Competencia</Label>
              <Select
                value={filters.competition_status}
                onValueChange={(v) => setFilters({ ...filters, competition_status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="winning">🏆 Ganando</SelectItem>
                  <SelectItem value="losing">❌ Perdiendo</SelectItem>
                  <SelectItem value="sharing_first_place">🤝 Compartiendo 1°</SelectItem>
                  <SelectItem value="listed">📋 Listado</SelectItem>
                  <SelectItem value="penalized">⚠️ Penalizado</SelectItem>
                </SelectContent>
              </Select>
              {filters.competition_status !== "all" && (
                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                  ℹ️ Este filtro solo muestra productos que ya han sido analizados. Usa el botón &quot;Analizar&quot;
                  para obtener datos de competencia.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tipo de Publicación</Label>
              <Select value={filters.listing_type} onValueChange={(v) => setFilters({ ...filters, listing_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="gold_special">Clásica</SelectItem>
                  <SelectItem value="gold_pro">Premium</SelectItem>
                  <SelectItem value="free">Gratuita</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Elegibilidad</Label>
              <Select value={filters.tags} onValueChange={(v) => setFilters({ ...filters, tags: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="catalog_listing_eligible">Elegibles para Catálogo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estado Detallado</Label>
              <Select value={filters.sub_status} onValueChange={(v) => setFilters({ ...filters, sub_status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="out_of_stock">Sin Stock (Por Pausar)</SelectItem>
                  <SelectItem value="warning">Con Advertencia</SelectItem>
                  <SelectItem value="waiting_for_patch">Esperando Corrección</SelectItem>
                  <SelectItem value="held">En Moderación</SelectItem>
                  <SelectItem value="pending_documentation">Documentación Pendiente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {filters.status !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Estado: {filters.status}
                <button
                  onClick={() => setFilters({ ...filters, status: "all" })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            )}
            {filters.catalog_listing !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Catálogo: {filters.catalog_listing === "true" ? "Sí" : "No"}
                <button
                  onClick={() => setFilters({ ...filters, catalog_listing: "all" })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            )}
            {filters.competition_status !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Competencia: {getCompetitionStatusText(filters.competition_status)}
                <button
                  onClick={() => setFilters({ ...filters, competition_status: "all" })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            )}
            {filters.tags !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Elegibles para Catálogo
                <button onClick={() => setFilters({ ...filters, tags: "all" })} className="ml-1 hover:text-destructive">
                  ×
                </button>
              </Badge>
            )}
            {filters.sub_status !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Sub-estado: {filters.sub_status}
                <button
                  onClick={() => setFilters({ ...filters, sub_status: "all" })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            )}
            {(filters.status !== "all" ||
              filters.catalog_listing !== "all" ||
              filters.competition_status !== "all" ||
              filters.tags !== "all" ||
              filters.sub_status !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setFilters({
                    status: "all",
                    catalog_listing: "true",
                    listing_type: "all",
                    tags: "all",
                    sub_status: "all",
                    competition_status: "all",
                  })
                }
              >
                Limpiar Filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <Input
            placeholder="Buscar por título o ID (MLA)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label>Ordenar por:</Label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sold_quantity_desc">Más Vendidos</SelectItem>
                <SelectItem value="sold_quantity_asc">Menos Vendidos</SelectItem>
                <SelectItem value="price_desc">Precio: Mayor a Menor</SelectItem>
                <SelectItem value="price_asc">Precio: Menor a Mayor</SelectItem>
                <SelectItem value="date_desc">Más Recientes</SelectItem>
                <SelectItem value="date_asc">Más Antiguos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
