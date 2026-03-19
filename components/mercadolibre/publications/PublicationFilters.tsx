"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { RefreshCw, Search, Scale, Tag, ScanLine, Layers } from "lucide-react"
import { COLOR_MAP } from "@/components/mercadolibre/publications/types"
import type { UseMlPublicationsReturn } from "@/hooks/use-ml-publications"

interface PublicationFiltersProps {
  hook: UseMlPublicationsReturn
}

export function PublicationFilters({ hook }: PublicationFiltersProps) {
  const {
    accounts,
    accountId,
    setAccountId,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    sinProducto,
    setSinProducto,
    soloElegibles,
    setSoloElegibles,
    sinStock,
    setSinStock,
    stockFirst,
    setStockFirst,
    syncingML,
    loading,
    counts,
    countsLoading,
    weightSync,
    skuBackfill,
    showDuplicates,
    setShowDuplicates,
    loadingDuplicates,
    duplicateGroups,
    setPage,
    handleSearch,
    handleRefresh,
    syncWeights,
    backfillSku,
    syncWithML,
    loadDuplicates,
  } = hook

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Publicaciones (Mercado Libre)</h1>

          {/* Status count badges */}
          <div className="flex flex-wrap gap-2">
            {countsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-6 w-16 rounded-full bg-muted/40 animate-pulse" />
              ))
            ) : counts ? (
              <>
                <BadgeCount
                  label="Total"
                  value={counts.total}
                  active={statusFilter === "all" && !sinProducto}
                  onClick={() => {
                    setStatusFilter("all")
                    setSinProducto(false)
                    setPage(0)
                  }}
                />
                <BadgeCount
                  label="Activas"
                  value={counts.active}
                  color="green"
                  active={statusFilter === "active"}
                  onClick={() => {
                    setStatusFilter("active")
                    setSinProducto(false)
                    setPage(0)
                  }}
                />
                <BadgeCount
                  label="Pausadas"
                  value={counts.paused}
                  color="yellow"
                  active={statusFilter === "paused"}
                  onClick={() => {
                    setStatusFilter("paused")
                    setSinProducto(false)
                    setPage(0)
                  }}
                />
                <BadgeCount
                  label="Cerradas"
                  value={counts.closed}
                  color="zinc"
                  active={statusFilter === "closed"}
                  onClick={() => {
                    setStatusFilter("closed")
                    setSinProducto(false)
                    setPage(0)
                  }}
                />
                <BadgeCount
                  label="Sin producto"
                  value={counts.sin_producto}
                  color="orange"
                  active={sinProducto}
                  onClick={() => {
                    setSinProducto((p) => !p)
                    setSinStock(false)
                    setStatusFilter("all")
                    setPage(0)
                  }}
                />
                <BadgeCount
                  label="Sin stock"
                  value={counts.sin_stock}
                  color="red"
                  active={sinStock}
                  onClick={() => {
                    setSinStock((s) => !s)
                    setSinProducto(false)
                    setStatusFilter("all")
                    setPage(0)
                  }}
                />
                {counts.eligible_catalog != null && (
                  <BadgeCount
                    label="Elegibles catalogo"
                    value={counts.eligible_catalog}
                    color="emerald"
                    active={soloElegibles}
                    onClick={() => {
                      setSoloElegibles((s) => !s)
                      setSinStock(false)
                      setSinProducto(false)
                      setStatusFilter("all")
                      setPage(0)
                    }}
                  />
                )}
                {accountId !== "all" && (
                  <button
                    onClick={() => (showDuplicates ? setShowDuplicates(false) : loadDuplicates())}
                    className={`
                      inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium
                      transition-colors cursor-pointer
                      bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/25
                      ${showDuplicates ? "ring-2 ring-offset-1 ring-offset-background ring-current" : ""}
                    `}
                  >
                    <Layers className="h-3 w-3" />
                    {loadingDuplicates
                      ? "Buscando..."
                      : showDuplicates
                        ? `Duplicados ${duplicateGroups.length}`
                        : "Duplicados"}
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Weight sync result pill */}
          {weightSync.result && (
            <span className="text-xs text-muted-foreground">
              <span className="text-green-400 font-medium">{weightSync.result.updated}</span> actualizados
              {weightSync.result.missing > 0 && (
                <>
                  {" "}
                  · <span className="text-yellow-400">{weightSync.result.missing}</span> sin peso
                </>
              )}
            </span>
          )}

          {/* SKU backfill result pill */}
          {skuBackfill.result && (
            <span className="text-xs text-muted-foreground">
              <span className="text-green-400 font-medium">{skuBackfill.result.updated}</span> SKU cargados
              {skuBackfill.result.skipped > 0 && (
                <>
                  {" "}
                  · <span className="text-yellow-400">{skuBackfill.result.skipped}</span> sin SKU
                </>
              )}
            </span>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={backfillSku}
                disabled={skuBackfill.loading || accountId === "all"}
                className="bg-transparent"
              >
                <Tag className={`h-4 w-4 mr-2 ${skuBackfill.loading ? "animate-spin" : ""}`} />
                {skuBackfill.loading ? "Rellenando..." : "Backfill SKU"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {accountId === "all"
                ? "Selecciona una cuenta primero"
                : "Rellena el campo SKU para publicaciones sin SKU consultando la API de ML"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={syncWeights}
                disabled={weightSync.loading || accountId === "all"}
                className="bg-transparent"
              >
                <Scale className={`h-4 w-4 mr-2 ${weightSync.loading ? "animate-spin" : ""}`} />
                {weightSync.loading ? "Sincronizando..." : "Sincronizar pesos"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {accountId === "all"
                ? "Selecciona una cuenta primero"
                : "Sincroniza el peso (g) de cada publicacion desde ML"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading || countsLoading}
                className="bg-transparent"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading || countsLoading ? "animate-spin" : ""}`} />
                Refrescar
              </Button>
            </TooltipTrigger>
            <TooltipContent>Recarga los datos desde la DB local. No llama a ML.</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="default" size="sm" onClick={syncWithML} disabled={syncingML || accountId === "all"}>
                <ScanLine className={`h-4 w-4 mr-2 ${syncingML ? "animate-spin" : ""}`} />
                {syncingML ? "Sincronizando..." : "Sincronizar con ML"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {accountId === "all"
                ? "Selecciona una cuenta primero"
                : "Llama a la API de ML, hidrata items con multiget y persiste las filas realmente guardadas en DB. El progreso se registra en ml_import_progress."}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Cuenta */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Cuenta</label>
          <Select
            value={accountId}
            onValueChange={(v) => {
              setAccountId(v)
              setPage(0)
            }}
          >
            <SelectTrigger className="w-48 h-9 bg-transparent">
              <SelectValue placeholder="Todas las cuentas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cuentas</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.nickname}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estado */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Estado</label>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v)
              setPage(0)
            }}
          >
            <SelectTrigger className="w-36 h-9 bg-transparent">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activas</SelectItem>
              <SelectItem value="paused">Pausadas</SelectItem>
              <SelectItem value="under_review">Revision</SelectItem>
              <SelectItem value="closed">Cerradas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Busqueda */}
        <div className="space-y-1 flex-1 min-w-52">
          <label className="text-xs text-muted-foreground">Buscar</label>
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Titulo o Item ID..."
              className="h-9 bg-transparent"
            />
            <Button onClick={handleSearch} size="sm" variant="outline" className="h-9 bg-transparent px-3">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex gap-4 items-center pb-0.5">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sinProducto}
              onChange={(e) => {
                setSinProducto(e.target.checked)
                setPage(0)
              }}
              className="accent-primary"
            />
            Sin producto
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={soloElegibles}
              onChange={(e) => {
                setSoloElegibles(e.target.checked)
                setPage(0)
              }}
              className="accent-primary"
            />
            Solo elegibles catalogo
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sinStock}
              onChange={(e) => {
                setSinStock(e.target.checked)
                setPage(0)
              }}
              className="accent-primary"
            />
            Sin stock
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={stockFirst}
              onChange={(e) => {
                setStockFirst(e.target.checked)
                setPage(0)
              }}
              className="accent-primary"
            />
            Stock primero
          </label>
        </div>
      </div>
    </>
  )
}

// ── BadgeCount sub-component ──────────────────────────────────────────────

function BadgeCount({
  label,
  value,
  color = "default",
  active,
  onClick,
}: {
  label: string
  value: number
  color?: string
  active?: boolean
  onClick?: () => void
}) {
  const cls = COLOR_MAP[color] ?? COLOR_MAP.default
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium
        transition-colors cursor-pointer
        ${cls}
        ${active ? "ring-2 ring-offset-1 ring-offset-background ring-current" : ""}
      `}
    >
      {label}
      <span className="tabular-nums">{value.toLocaleString("es-AR")}</span>
    </button>
  )
}
