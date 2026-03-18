"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  FileText, RefreshCw, Download, Search, ChevronLeft, ChevronRight, Loader2, Building2,
} from "lucide-react"
import { TIPO_COMPROBANTE, fmtFecha, fmtMoney, nroFmt } from "./types"
import type { ArcaConfig, Factura } from "./types"

function estadoBadge(estado: string) {
  if (estado === "emitida")   return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">Emitida</Badge>
  if (estado === "pendiente") return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">Pendiente</Badge>
  if (estado === "error")     return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">Error</Badge>
  return <Badge className="bg-muted text-muted-foreground text-xs">{estado}</Badge>
}

interface InvoiceTableProps {
  config: ArcaConfig | null
  facturas: Factura[]
  loadingF: boolean
  searchQ: string
  setSearchQ: (v: string) => void
  filterEstado: string
  setFilterEstado: (v: string) => void
  page: number
  setPage: (fn: number | ((p: number) => number)) => void
  totalPages: number
  total: number
  loadFacturas: (p?: number) => void
  refetchingId: string | null
  refetchBilling: (id: string) => void
  setActiveTab: (tab: string) => void
}

export function InvoiceTable({
  config, facturas, loadingF,
  searchQ, setSearchQ, filterEstado, setFilterEstado,
  page, setPage, totalPages, total,
  loadFacturas, refetchingId, refetchBilling, setActiveTab,
}: InvoiceTableProps) {
  return (
    <>
      {!config && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-4 flex items-center gap-3">
          <Building2 className="h-5 w-5 text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-300">
            Para emitir facturas primero completa los datos en la pestana{" "}
            <button onClick={() => setActiveTab("config")} className="underline font-semibold">Configuracion ARCA</button>.
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por receptor, CUIT, CAE..."
            className="pl-9"
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); setPage(0) }}
          />
        </div>
        <Select value={filterEstado} onValueChange={v => { setFilterEstado(v); setPage(0) }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="emitida">Emitidas</SelectItem>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="error">Con error</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => loadFacturas(page)}>
          <RefreshCw className={`h-4 w-4 ${loadingF ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Tipo</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">N° Comprobante</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Fecha</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Receptor</th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Total</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Estado</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">CAE</th>
              <th className="p-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loadingF ? (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
            ) : facturas.length === 0 ? (
              <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No hay facturas emitidas</p>
              </td></tr>
            ) : facturas.map(f => (
              <tr key={f.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="p-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded border-2 border-current font-bold text-sm font-mono">
                    {TIPO_COMPROBANTE[f.tipo_comprobante]?.letra || "?"}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs">{nroFmt(f.punto_venta, f.numero)}</td>
                <td className="p-3 text-muted-foreground text-xs">{fmtFecha(f.fecha)}</td>
                <td className="p-3">
                  <p className="font-medium leading-tight">{f.razon_social_receptor}</p>
                  <p className="text-xs text-muted-foreground">{f.nro_doc_receptor}</p>
                </td>
                <td className="p-3 text-right font-mono font-semibold hidden md:table-cell">
                  {fmtMoney(Number(f.importe_total))}
                </td>
                <td className="p-3">{estadoBadge(f.estado)}</td>
                <td className="p-3 font-mono text-xs text-muted-foreground hidden lg:table-cell">
                  {f.cae || "\u2014"}
                </td>
                <td className="p-3 flex items-center gap-1">
                  {f.cae && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title="Ver factura"
                      onClick={() => window.open(`/api/billing/facturas/${f.id}/pdf`, "_blank")}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {f.orden_id && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title="Re-obtener datos fiscales desde ML"
                      disabled={refetchingId === f.id}
                      onClick={() => refetchBilling(f.id)}
                    >
                      {refetchingId === f.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RefreshCw className="h-3.5 w-3.5" />
                      }
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginacion */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-muted-foreground">
            {total.toLocaleString("es-AR")} facturas — Pagina {page + 1} de {totalPages}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage((p: number) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage((p: number) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
