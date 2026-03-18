"use client"

import { CheckCircle2, XCircle } from "lucide-react"
import type { ArcaConfig } from "./types"

interface BillingStatsProps {
  total: number
  config: ArcaConfig | null
}

export function BillingStats({ total, config }: BillingStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total emitidas</p>
        <p className="text-2xl font-bold">{total.toLocaleString("es-AR")}</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Estado ARCA</p>
        {config ? (
          <div className="flex items-center gap-2 mt-1">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">
              {config.ambiente === "produccion" ? "Produccion" : "Homologacion"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1">
            <XCircle className="h-5 w-5 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">Sin configurar</span>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">CUIT</p>
        <p className="text-sm font-mono font-semibold">{config?.cuit?.replace(/(\d{2})(\d{8})(\d)/, "$1-$2-$3") || "\u2014"}</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Punto de venta</p>
        {config ? (
          <>
            <p className="text-2xl font-bold font-mono">{String(config.punto_venta).padStart(4, "0")}</p>
            {config.nombre_empresa && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{config.nombre_empresa}</p>
            )}
          </>
        ) : (
          <p className="text-2xl font-bold">{"\u2014"}</p>
        )}
      </div>
    </div>
  )
}
