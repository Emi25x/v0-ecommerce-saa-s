"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  ExternalLink,
  Copy,
  CheckCircle2,
  Info,
  ShoppingCart,
  AlertCircle,
  Layers,
  History,
  TrendingDown,
  ShoppingBag,
  X,
  RefreshCw,
} from "lucide-react"
import type { Publication } from "@/components/mercadolibre/publications/types"
import {
  STATUS_LABEL,
  STATUS_COLOR,
  SOURCE_LABEL,
  ORDER_STATUS_LABEL,
  fmt,
  relDate,
} from "@/components/mercadolibre/publications/types"
import type { UseMlPublicationsReturn } from "@/hooks/use-ml-publications"

interface PublicationDialogsProps {
  hook: UseMlPublicationsReturn
}

export function PublicationDialogs({ hook }: PublicationDialogsProps) {
  const {
    detail,
    setDetail,
    copied,
    copiedLink,
    copyId,
    historialItem,
    setHistorialItem,
    historialLoading,
    historialData,
    importProgress,
    counts,
    refreshProgress,
    selected,
    setSelected,
    batchEnqueueing,
    batchOptIn,
    showDuplicates,
    setShowDuplicates,
    duplicateGroups,
    loadingDuplicates,
    loadDuplicates,
    closingItem,
    closePub,
    mlStats,
    accountId,
  } = hook

  return (
    <>
      {/* ── Import progress indicator ───────────────────────────────────── */}
      {importProgress && (
        <ImportProgressPanel importProgress={importProgress} counts={counts} refreshProgress={refreshProgress} />
      )}

      {/* ── Barra accion masiva ─────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 flex items-center gap-3 text-sm">
          <span className="font-medium text-emerald-300">
            {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-emerald-500/40 hover:bg-emerald-500/10"
            onClick={batchOptIn}
            disabled={batchEnqueueing}
          >
            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
            {batchEnqueueing ? "Encolando..." : "Opt-in catalogo"}
          </Button>
          <button
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelected(new Set())}
          >
            Limpiar seleccion
          </button>
        </div>
      )}

      {/* ── Panel duplicados ────────────────────────────────────────────── */}
      {showDuplicates && (
        <DuplicatesPanel
          duplicateGroups={duplicateGroups}
          loadingDuplicates={loadingDuplicates}
          loadDuplicates={loadDuplicates}
          setShowDuplicates={setShowDuplicates}
          closingItem={closingItem}
          closePub={closePub}
          mlStats={mlStats}
        />
      )}

      {/* ── Modal detalle ────────────────────────────────────────────────── */}
      {detail && <DetailModal detail={detail} onClose={() => setDetail(null)} copied={copied} copyId={copyId} />}

      {/* ── Modal Historial ───────────────────────────────────────────────── */}
      {historialItem && (
        <HistorialModal
          historialItem={historialItem}
          historialLoading={historialLoading}
          historialData={historialData}
          onClose={() => setHistorialItem(null)}
        />
      )}
    </>
  )
}

// ── Import Progress Panel ────────────────────────────────────────────────────

function ImportProgressPanel({
  importProgress,
  counts,
  refreshProgress,
}: {
  importProgress: NonNullable<UseMlPublicationsReturn["importProgress"]>
  counts: UseMlPublicationsReturn["counts"]
  refreshProgress: () => void
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm space-y-2 ${
        importProgress.status === "error" || importProgress.last_error
          ? "border-red-500/30 bg-red-500/5"
          : importProgress.publications_scope === "active_only"
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-muted-foreground font-medium">
          Importacion{" "}
          <span
            className={
              importProgress.status === "running"
                ? "text-blue-400"
                : importProgress.status === "done"
                  ? "text-green-400"
                  : importProgress.status === "error"
                    ? "text-red-400"
                    : importProgress.status === "paused"
                      ? "text-yellow-400"
                      : importProgress.status === "scan_complete_pending_verification"
                        ? "text-amber-400"
                        : "text-muted-foreground"
            }
          >
            {importProgress.status === "running"
              ? "en curso"
              : importProgress.status === "done"
                ? "completada"
                : importProgress.status === "scan_complete_pending_verification"
                  ? "scan completo \u2014 verificar"
                  : importProgress.status}
          </span>
        </span>

        {importProgress.publications_scope === "active_only" && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5">
            <Info className="h-3 w-3" />
            Solo activas \u2014 puede faltar pausadas/cerradas
          </span>
        )}

        <button
          onClick={refreshProgress}
          className="ml-auto text-muted-foreground hover:text-foreground"
          title="Actualizar estado"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${importProgress.status === "running" ? "animate-spin text-blue-400" : ""}`}
          />
        </button>
      </div>

      {/* Diagnostico: grilla de metricas clave */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 py-1">
        <DiagStat
          label="DB rows"
          value={counts?.total ?? null}
          color="default"
          tooltip="Filas totales en ml_publications para esta cuenta"
        />
        <DiagStat
          label="ML total"
          value={importProgress.publications_total ?? null}
          color="default"
          tooltip="Total de publicaciones reportado por la API de ML"
        />
        <DiagStat
          label="ML vistas"
          value={importProgress.ml_items_seen_count ?? importProgress.discovered_count ?? null}
          color="blue"
          tooltip="IDs que el importador leyo de ML en la ultima corrida"
        />
        <DiagStat
          label="DB upserted"
          value={importProgress.db_rows_upserted_count ?? importProgress.upsert_new_count ?? null}
          color="green"
          tooltip="Filas que realmente quedaron persistidas en DB (confirmadas por Supabase)"
        />
        <DiagStat
          label="Errores upsert"
          value={importProgress.upsert_errors_count ?? null}
          color={(importProgress.upsert_errors_count ?? 0) > 0 ? "red" : "default"}
          tooltip="Filas enviadas al upsert que no quedaron confirmadas"
        />
      </div>

      {/* Barra de progreso ML seen */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span className="flex items-center gap-3 flex-wrap">
            <span>
              Status:{" "}
              <span
                className={
                  importProgress.status === "running"
                    ? "text-blue-400 font-semibold"
                    : importProgress.status === "done"
                      ? "text-green-400 font-semibold"
                      : importProgress.status === "error"
                        ? "text-red-400 font-semibold"
                        : importProgress.status === "paused"
                          ? "text-yellow-400 font-semibold"
                          : importProgress.status === "scan_complete_pending_verification"
                            ? "text-amber-400 font-semibold"
                            : "text-muted-foreground"
                }
              >
                {importProgress.status}
              </span>
            </span>
          </span>
          {importProgress.last_sync_batch_at && <span>Ultimo batch: {relDate(importProgress.last_sync_batch_at)}</span>}
        </div>
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              importProgress.status === "running"
                ? "bg-blue-500 animate-pulse"
                : importProgress.status === "done"
                  ? "bg-green-500"
                  : importProgress.status === "scan_complete_pending_verification"
                    ? "bg-amber-500"
                    : importProgress.status === "error"
                      ? "bg-red-500"
                      : "bg-muted-foreground/50"
            }`}
            style={{
              width: importProgress.publications_total
                ? `${Math.min(100, ((importProgress.db_rows_upserted_count ?? importProgress.upsert_new_count ?? importProgress.publications_offset ?? 0) / importProgress.publications_total) * 100)}%`
                : "100%",
            }}
          />
        </div>
      </div>

      {/* Alerta de import incompleto */}
      {(() => {
        const seen = importProgress.ml_items_seen_count ?? importProgress.discovered_count ?? 0
        const saved =
          importProgress.db_rows_upserted_count ??
          importProgress.upsert_new_count ??
          importProgress.publications_offset ??
          0
        const missing = seen - saved
        if (seen > 0 && missing > 10) {
          return (
            <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">
                <span className="font-semibold">Import incompleto:</span> ML envio {seen.toLocaleString("es-AR")} IDs
                pero solo {saved.toLocaleString("es-AR")} filas quedaron persistidas en DB. Faltan{" "}
                <span className="font-bold">{missing.toLocaleString("es-AR")}</span> filas. Usa "Sincronizar con ML"
                para reintentar.
              </p>
            </div>
          )
        }
        return null
      })()}

      {/* Error de ultima corrida */}
      {importProgress.last_error && (
        <p className="text-xs text-red-400 font-mono truncate">Error: {importProgress.last_error}</p>
      )}
    </div>
  )
}

// ── DiagStat ───────────────────────────────────────────────────────────────

function DiagStat({
  label,
  value,
  color = "default",
  tooltip,
}: {
  label: string
  value: number | null | undefined
  color?: "default" | "blue" | "green" | "red" | "yellow"
  tooltip?: string
}) {
  const valueColor = {
    default: "text-foreground",
    blue: "text-blue-400",
    green: "text-green-400",
    red: "text-red-400",
    yellow: "text-yellow-400",
  }[color]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 cursor-default">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
          <p className={`text-base font-semibold tabular-nums ${valueColor}`}>
            {value != null ? (
              value.toLocaleString("es-AR")
            ) : (
              <span className="text-muted-foreground text-sm">\u2014</span>
            )}
          </p>
        </div>
      </TooltipTrigger>
      {tooltip && (
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {tooltip}
        </TooltipContent>
      )}
    </Tooltip>
  )
}

// ── Duplicates Panel ────────────────────────────────────────────────────────

function DuplicatesPanel({
  duplicateGroups,
  loadingDuplicates,
  loadDuplicates,
  setShowDuplicates,
  closingItem,
  closePub,
  mlStats,
}: {
  duplicateGroups: UseMlPublicationsReturn["duplicateGroups"]
  loadingDuplicates: boolean
  loadDuplicates: () => void
  setShowDuplicates: (v: boolean) => void
  closingItem: string | null
  closePub: (pub: Publication) => void
  mlStats: Record<string, { sold_quantity: number; listing_type_id: string | null }>
}) {
  return (
    <div className="border border-orange-500/30 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-orange-500/20 bg-orange-500/5">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-orange-400" />
          <span className="font-medium text-sm">Publicaciones duplicadas por SKU</span>
          {!loadingDuplicates && (
            <span className="text-xs text-muted-foreground">
              \u2014{" "}
              {duplicateGroups.length === 0
                ? "sin duplicados"
                : `${duplicateGroups.length} SKU${duplicateGroups.length !== 1 ? "s" : ""} con duplicados`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadDuplicates}
            disabled={loadingDuplicates}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            {loadingDuplicates ? "Buscando..." : "Recargar"}
          </button>
          <button onClick={() => setShowDuplicates(false)} className="text-muted-foreground hover:text-foreground p-1">
            \u2715
          </button>
        </div>
      </div>

      {/* Content */}
      {loadingDuplicates ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Buscando duplicados...</div>
      ) : duplicateGroups.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Sin duplicados encontrados para esta cuenta.
        </div>
      ) : (
        <div className="divide-y divide-orange-500/10 max-h-[600px] overflow-y-auto">
          {duplicateGroups.map((group) => (
            <div key={group.sku} className="p-4 space-y-3">
              {/* Grupo header */}
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-orange-300">{group.sku}</span>
                <span className="text-xs text-muted-foreground">
                  {group.traditional.length} tradicional{group.traditional.length !== 1 ? "es" : ""}
                  {group.catalog.length > 0 && ` \u00b7 ${group.catalog.length} catalogo`}
                </span>
              </div>

              {/* Tradicionales */}
              {group.traditional.length > 0 && (
                <DuplicateGroupSection
                  label="Tradicionales"
                  pubs={group.traditional}
                  closingItem={closingItem}
                  closePub={closePub}
                  mlStats={mlStats}
                />
              )}

              {/* Catalogo */}
              {group.catalog.length > 0 && (
                <DuplicateGroupSection
                  label="Catalogo"
                  pubs={group.catalog}
                  closingItem={closingItem}
                  closePub={closePub}
                  mlStats={mlStats}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DuplicateGroupSection({
  label,
  pubs,
  closingItem,
  closePub,
  mlStats,
}: {
  label: string
  pubs: Publication[]
  closingItem: string | null
  closePub: (pub: Publication) => void
  mlStats: Record<string, { sold_quantity: number; listing_type_id: string | null }>
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {pubs.map((pub, i) => (
        <div
          key={pub.ml_item_id}
          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
            i === 0 ? "bg-muted/10 border-border" : "bg-orange-500/5 border-orange-500/20"
          }`}
        >
          <span className="font-mono text-xs text-muted-foreground w-28 shrink-0">{pub.ml_item_id}</span>
          {i === 0 && <span className="text-[10px] text-green-400 font-medium shrink-0">conservar</span>}
          {i > 0 && <span className="text-[10px] text-orange-400 font-medium shrink-0">duplicado</span>}
          <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_COLOR[pub.status] ?? ""}`}>
            {STATUS_LABEL[pub.status] ?? pub.status}
          </Badge>
          <span className="text-xs text-muted-foreground shrink-0">{fmt(pub.price)}</span>
          <span className={`text-xs shrink-0 ${pub.current_stock === 0 ? "text-red-400" : "text-muted-foreground"}`}>
            Stock: {pub.current_stock ?? "\u2014"}
          </span>
          {mlStats[pub.ml_item_id] != null && (
            <span className="text-xs text-blue-400 shrink-0">{mlStats[pub.ml_item_id].sold_quantity} ventas</span>
          )}
          {mlStats[pub.ml_item_id]?.listing_type_id && (
            <span className="text-[10px] text-muted-foreground shrink-0 border border-muted-foreground/20 rounded px-1 py-0.5">
              {mlStats[pub.ml_item_id].listing_type_id === "gold_premium"
                ? "Gold Premium \u00b7 cuotas"
                : mlStats[pub.ml_item_id].listing_type_id === "gold_special"
                  ? "Gold Especial"
                  : mlStats[pub.ml_item_id].listing_type_id === "gold_pro"
                    ? "Catalogo"
                    : mlStats[pub.ml_item_id].listing_type_id}
            </span>
          )}
          <span className="flex-1 text-xs text-muted-foreground truncate">{pub.title}</span>
          {pub.permalink && (
            <a
              href={pub.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs px-2 shrink-0 border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-40"
            disabled={closingItem === pub.ml_item_id || pub.status === "closed"}
            onClick={() => closePub(pub)}
          >
            {closingItem === pub.ml_item_id
              ? "Eliminando..."
              : pub.status === "closed"
                ? "Eliminada"
                : "Eliminar en ML"}
          </Button>
        </div>
      ))}
    </div>
  )
}

// ── Detail Modal ────────────────────────────────────────────────────────────

function DetailModal({
  detail,
  onClose,
  copied,
  copyId,
}: {
  detail: Publication
  onClose: () => void
  copied: string | null
  copyId: (id: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-background border rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-semibold leading-snug text-balance">{detail.title}</h2>
            <Badge variant="outline" className={`text-xs ${STATUS_COLOR[detail.status] ?? ""}`}>
              {STATUS_LABEL[detail.status] ?? detail.status}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground shrink-0 text-lg leading-none"
          >
            \u2715
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {(
            [
              ["Item ID", detail.ml_item_id],
              ["Precio", fmt(detail.price)],
              ["Stock", detail.current_stock ?? "\u2014"],
              ["SKU", detail.sku ?? "\u2014"],
              ["EAN", detail.ean ?? "\u2014"],
              ["ISBN", detail.isbn ?? "\u2014"],
              ["GTIN", detail.gtin ?? "\u2014"],
              ["Elegible catalogo", detail.catalog_listing_eligible ? "Si" : "No"],
              ["En catalogo", detail.catalog_listing ? "Si" : "No"],
              ["Peso (g)", detail.meli_weight_g != null ? `${detail.meli_weight_g} g` : "\u2014"],
              ["Producto vinculado", detail.product_id ? "Si" : "No"],
              [
                "Ultima sync ML",
                detail.last_sync_at ? new Date(detail.last_sync_at).toLocaleString("es-AR") : "\u2014",
              ],
              ["Actualizado", detail.updated_at ? new Date(detail.updated_at).toLocaleString("es-AR") : "\u2014"],
            ] as [string, string | number][]
          ).map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-medium break-all">{String(value)}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-1">
          {detail.permalink && (
            <a
              href={detail.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-400 hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir en MercadoLibre
            </a>
          )}
          <button
            onClick={() => copyId(detail.ml_item_id)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground ml-auto"
          >
            {copied === detail.ml_item_id ? (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Copiar ID
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Historial Modal ─────────────────────────────────────────────────────────

function HistorialModal({
  historialItem,
  historialLoading,
  historialData,
  onClose,
}: {
  historialItem: Publication
  historialLoading: boolean
  historialData: UseMlPublicationsReturn["historialData"]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-background border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b shrink-0">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground shrink-0" />
              <h2 className="font-semibold truncate">{historialItem.title}</h2>
            </div>
            <p className="text-xs text-muted-foreground">{historialItem.ml_item_id} \u00b7 ultimos 7 dias</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {historialLoading ? (
            <div className="text-center text-sm text-muted-foreground py-10">Cargando historial...</div>
          ) : (
            <>
              {/* Snapshot actual desde ML */}
              {historialData?.ml_snapshot && (
                <section className="bg-muted/40 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
                  <div className="text-xs text-muted-foreground">Stock actual en ML</div>
                  <div className="flex items-center gap-4 text-sm">
                    <span
                      className={`font-semibold ${
                        (historialData.ml_snapshot.available_quantity ?? 0) === 0 ? "text-red-400" : "text-foreground"
                      }`}
                    >
                      {historialData.ml_snapshot.available_quantity ?? "\u2013"} u.
                    </span>
                    {historialData.ml_snapshot.price != null && (
                      <span className="text-muted-foreground">{fmt(historialData.ml_snapshot.price)}</span>
                    )}
                    {historialData.ml_snapshot.status && (
                      <span className="text-xs text-muted-foreground capitalize">
                        {historialData.ml_snapshot.status}
                      </span>
                    )}
                  </div>
                </section>
              )}

              {/* Cambios de stock */}
              <section>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-blue-400" />
                  Cambios de stock
                  <span className="text-xs text-muted-foreground font-normal">
                    (ultimos 7 dias \u2014 capturados via webhook ML)
                  </span>
                </h3>
                {!historialData?.stock_history?.length ? (
                  <p className="text-xs text-muted-foreground">
                    Sin cambios registrados en los ultimos 7 dias. Los cambios futuros se capturaran automaticamente via
                    webhooks de ML.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {historialData.stock_history.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between gap-3 text-sm bg-muted/30 rounded-lg px-3 py-2.5"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                              {SOURCE_LABEL[entry.source] ?? entry.source}
                            </span>
                            {entry.notes && (
                              <span className="text-xs text-muted-foreground truncate">{entry.notes}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>
                              {entry.old_quantity != null ? `${entry.old_quantity} \u2192 ` : ""}
                              <span
                                className={
                                  entry.new_quantity === 0 ? "text-red-400 font-medium" : "text-foreground font-medium"
                                }
                              >
                                {entry.new_quantity}
                              </span>
                            </span>
                          </div>
                        </div>
                        <time className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {new Date(entry.created_at).toLocaleString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Ventas de la semana */}
              <section>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-green-400" />
                  Ventas
                  {historialData?.sales?.length ? (
                    <span className="text-xs text-muted-foreground font-normal">
                      ({historialData.sales.reduce((s, o) => s + o.qty_sold, 0)} unidades \u00b7{" "}
                      {historialData.sales.length} orden{historialData.sales.length !== 1 ? "es" : ""})
                    </span>
                  ) : null}
                </h3>
                {!historialData?.sales?.length ? (
                  <p className="text-xs text-muted-foreground">Sin ventas registradas en los ultimos 7 dias.</p>
                ) : (
                  <div className="space-y-2">
                    {historialData.sales.map((sale) => (
                      <div
                        key={sale.order_id}
                        className="flex items-center justify-between gap-3 text-sm bg-muted/30 rounded-lg px-3 py-2.5"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{sale.qty_sold} u.</span>
                            <span className="text-muted-foreground">\u00d7</span>
                            <span>{fmt(sale.unit_price)}</span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                sale.status === "paid"
                                  ? "bg-green-500/15 text-green-400"
                                  : "bg-yellow-500/15 text-yellow-400"
                              }`}
                            >
                              {ORDER_STATUS_LABEL[sale.status] ?? sale.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">Orden #{sale.order_id}</p>
                        </div>
                        <time className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {new Date(sale.date).toLocaleString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
