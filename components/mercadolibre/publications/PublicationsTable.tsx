"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  ExternalLink,
  Copy,
  Link2,
  CheckCircle2,
  Info,
  MoreHorizontal,
  ShoppingCart,
  Zap,
  RotateCcw,
  ScanLine,
  AlertCircle,
  History,
  Package,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import Link from "next/link"
import type { Publication } from "@/components/mercadolibre/publications/types"
import { PAGE_SIZE, STATUS_LABEL, STATUS_COLOR, fmt, relDate } from "@/components/mercadolibre/publications/types"
import type { UseMlPublicationsReturn } from "@/hooks/use-ml-publications"

interface PublicationsTableProps {
  hook: UseMlPublicationsReturn
}

export function PublicationsTable({ hook }: PublicationsTableProps) {
  const {
    rows,
    total,
    loading,
    page,
    totalPages,
    selected,
    copied,
    copiedLink,
    enqueueing,
    verifying,
    sinProducto,
    soloElegibles,
    statusFilter,
    search,
    setDetail,
    copyId,
    copyLink,
    toggleSelect,
    selectAllEligible,
    setSelected,
    enqueueJob,
    verifyItem,
    openHistorial,
    prevPage,
    nextPage,
  } = hook

  if (rows.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center border border-dashed rounded-xl">
        <Package className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-lg font-medium">No hay publicaciones</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          {sinProducto || soloElegibles || statusFilter !== "all" || search
            ? "Ninguna publicacion cumple los filtros activos."
            : "Primero importa tus publicaciones desde la seccion de importacion inicial."}
        </p>
        {!sinProducto && !soloElegibles && statusFilter === "all" && !search && (
          <Button asChild>
            <Link href="/ml/importer">Ir a Importacion inicial</Link>
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-3 w-8">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <input
                      type="checkbox"
                      className="accent-primary cursor-pointer"
                      checked={
                        selected.size > 0 &&
                        rows
                          .filter((r) => r.catalog_listing_eligible && !r.catalog_listing)
                          .every((r) => selected.has(r.ml_item_id))
                      }
                      onChange={(e) => (e.target.checked ? selectAllEligible() : setSelected(new Set()))}
                    />
                  </TooltipTrigger>
                  <TooltipContent>Seleccionar elegibles de esta pagina</TooltipContent>
                </Tooltip>
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Item ID</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Titulo</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Estado</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Precio</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">EAN / ISBN</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Cat.</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Peso (g)</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Actualizado</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted/40 rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <TableRow
                    key={row.id}
                    row={row}
                    selected={selected}
                    copied={copied}
                    copiedLink={copiedLink}
                    enqueueing={enqueueing}
                    verifying={verifying}
                    onDetail={setDetail}
                    onCopyId={copyId}
                    onCopyLink={copyLink}
                    onToggleSelect={toggleSelect}
                    onEnqueueJob={enqueueJob}
                    onVerifyItem={verifyItem}
                    onOpenHistorial={openHistorial}
                  />
                ))}
          </tbody>
        </table>
      </div>

      {/* Paginacion */}
      {total > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Cargando..."
              : `${(page * PAGE_SIZE + 1).toLocaleString("es-AR")}\u2013${Math.min((page + 1) * PAGE_SIZE, total).toLocaleString("es-AR")} de ${total.toLocaleString("es-AR")}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={prevPage}
              disabled={page === 0 || loading}
              className="bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm tabular-nums">
              {page + 1} / {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={nextPage}
              disabled={page >= totalPages - 1 || loading}
              className="bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Table Row ────────────────────────────────────────────────────────────────

interface TableRowProps {
  row: Publication
  selected: Set<string>
  copied: string | null
  copiedLink: string | null
  enqueueing: string | null
  verifying: string | null
  onDetail: (row: Publication) => void
  onCopyId: (id: string) => void
  onCopyLink: (permalink: string, id: string) => void
  onToggleSelect: (ml_item_id: string) => void
  onEnqueueJob: (pub: Publication, type: "catalog_optin" | "buybox_sync" | "import_single_item") => void
  onVerifyItem: (pub: Publication) => void
  onOpenHistorial: (pub: Publication) => void
}

function TableRow({
  row,
  selected,
  copied,
  copiedLink,
  enqueueing,
  verifying,
  onDetail,
  onCopyId,
  onCopyLink,
  onToggleSelect,
  onEnqueueJob,
  onVerifyItem,
  onOpenHistorial,
}: TableRowProps) {
  return (
    <tr className="border-b hover:bg-muted/20 transition-colors group cursor-pointer" onClick={() => onDetail(row)}>
      {/* Checkbox seleccion */}
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        {row.catalog_listing_eligible && !row.catalog_listing && (
          <input
            type="checkbox"
            className="accent-primary cursor-pointer"
            checked={selected.has(row.ml_item_id)}
            onChange={() => onToggleSelect(row.ml_item_id)}
          />
        )}
      </td>

      {/* Item ID */}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{row.ml_item_id}</span>
          <button
            onClick={() => onCopyId(row.ml_item_id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            title="Copiar item_id"
          >
            {copied === row.ml_item_id ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </td>

      {/* Titulo */}
      <td className="px-4 py-3 max-w-[240px]">
        <span className="line-clamp-2 leading-tight">{row.title}</span>
      </td>

      {/* Estado */}
      <td className="px-4 py-3">
        <Badge variant="outline" className={`text-xs whitespace-nowrap ${STATUS_COLOR[row.status] ?? ""}`}>
          {STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      </td>

      {/* Precio */}
      <td className="px-4 py-3 text-right font-mono text-sm whitespace-nowrap">{fmt(row.price)}</td>

      {/* Stock */}
      <td className="px-4 py-3 text-right">
        <span className={row.current_stock === 0 ? "text-red-400 font-medium" : ""}>
          {row.current_stock ?? "\u2014"}
        </span>
      </td>

      {/* SKU */}
      <td className="px-4 py-3 text-xs text-muted-foreground font-mono max-w-[100px]">
        <span className="truncate block">{row.sku ?? "\u2014"}</span>
      </td>

      {/* EAN / ISBN */}
      <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
        {row.isbn ?? row.ean ?? row.gtin ?? "\u2014"}
      </td>

      {/* Catalogo elegible */}
      <td className="px-4 py-3 text-center">
        {row.catalog_listing_eligible ? (
          <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" />
        ) : (
          <span className="text-muted-foreground/30 text-base leading-none">\u2014</span>
        )}
      </td>

      {/* Peso */}
      <td className="px-4 py-3 text-right font-mono text-xs whitespace-nowrap">
        {row.meli_weight_g != null ? (
          <span className="text-foreground">{row.meli_weight_g.toLocaleString()} g</span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-yellow-500/70">
                <AlertCircle className="h-3 w-3" />
                <span className="text-[11px]">Faltante</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Peso no sincronizado. Usa "Sincronizar pesos".</TooltipContent>
          </Tooltip>
        )}
      </td>

      {/* Fecha */}
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{relDate(row.updated_at)}</td>

      {/* Acciones */}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          {/* Abrir en ML + Copiar link */}
          {row.permalink && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={row.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Abrir en ML</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onCopyLink(row.permalink!, row.id)}
                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50"
                  >
                    {copiedLink === row.id ? (
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{copiedLink === row.id ? "Copiado!" : "Copiar link"}</TooltipContent>
              </Tooltip>
            </>
          )}

          {/* Detalle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onDetail(row)}
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50"
              >
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Ver detalle</TooltipContent>
          </Tooltip>

          {/* Menu Mas */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={enqueueing?.startsWith(row.ml_item_id) ?? false}
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50 disabled:opacity-40"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* Copiar item ID */}
              <DropdownMenuItem className="gap-2" onClick={() => onCopyId(row.ml_item_id)}>
                <Copy className="h-4 w-4" />
                Copiar item ID
              </DropdownMenuItem>

              {/* Abrir en ML */}
              {row.permalink && (
                <DropdownMenuItem className="gap-2" asChild>
                  <a href={row.permalink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Abrir en ML
                  </a>
                </DropdownMenuItem>
              )}

              {/* Opt-in catalogo */}
              {row.catalog_listing ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <DropdownMenuItem disabled className="gap-2 opacity-50">
                        <ShoppingCart className="h-4 w-4" />
                        Opt-in catalogo
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">Ya esta en catalogo</TooltipContent>
                </Tooltip>
              ) : row.catalog_linked_item_id ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <DropdownMenuItem disabled className="gap-2 opacity-50">
                        <ShoppingCart className="h-4 w-4" />
                        Opt-in catalogo
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">Ya tiene catalogo asociado ({row.catalog_linked_item_id})</TooltipContent>
                </Tooltip>
              ) : row.catalog_listing_eligible ? (
                <DropdownMenuItem
                  className="gap-2"
                  disabled={enqueueing === `${row.ml_item_id}:catalog_optin`}
                  onClick={() => onEnqueueJob(row, "catalog_optin")}
                >
                  <ShoppingCart className="h-4 w-4" />
                  Opt-in catalogo
                </DropdownMenuItem>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <DropdownMenuItem disabled className="gap-2 opacity-40">
                        <ShoppingCart className="h-4 w-4" />
                        Opt-in catalogo
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">No elegible para catalogo</TooltipContent>
                </Tooltip>
              )}

              {/* Sync buybox */}
              <DropdownMenuItem
                className="gap-2"
                disabled={enqueueing === `${row.ml_item_id}:buybox_sync`}
                onClick={() => onEnqueueJob(row, "buybox_sync")}
              >
                <Zap className="h-4 w-4" />
                Sync buybox
              </DropdownMenuItem>

              {/* Reimportar */}
              <DropdownMenuItem
                className="gap-2"
                disabled={enqueueing === `${row.ml_item_id}:import_single_item`}
                onClick={() => onEnqueueJob(row, "import_single_item")}
              >
                <RotateCcw className="h-4 w-4" />
                Reimportar
              </DropdownMenuItem>

              {/* Verificar con ML */}
              <DropdownMenuItem
                className="gap-2"
                disabled={verifying === row.ml_item_id}
                onClick={() => onVerifyItem(row)}
              >
                <ScanLine className="h-4 w-4" />
                {verifying === row.ml_item_id ? "Verificando..." : "Verificar con ML"}
              </DropdownMenuItem>

              {/* Historial */}
              <DropdownMenuItem className="gap-2" onClick={() => onOpenHistorial(row)}>
                <History className="h-4 w-4" />
                Historial
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  )
}
