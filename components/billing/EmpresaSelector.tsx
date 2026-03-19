"use client"

import { Building2, Plus } from "lucide-react"
import type { ArcaConfig, ConfigFormState } from "./types"
import { EMPTY_CONFIG_FORM } from "./types"

interface EmpresaSelectorProps {
  empresas: ArcaConfig[]
  empresaActivaId: string | null
  loadingConfig: boolean
  switchEmpresa: (id: string) => void
  cloneEmpresa: (id: string) => void
  setConfigForm: (fn: ConfigFormState | ((prev: ConfigFormState) => ConfigFormState)) => void
  setCloningFrom: (id: string | null) => void
  setActiveTab: (tab: string) => void
}

export function EmpresaSelector({
  empresas,
  empresaActivaId,
  loadingConfig,
  switchEmpresa,
  cloneEmpresa,
  setConfigForm,
  setCloningFrom,
  setActiveTab,
}: EmpresaSelectorProps) {
  if (loadingConfig) return null

  // Agrupar por CUIT para detectar multi-PV bajo mismo CUIT
  const cuitCount: Record<string, number> = {}
  empresas.forEach((e) => {
    cuitCount[e.cuit] = (cuitCount[e.cuit] || 0) + 1
  })

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {empresas.map((emp) => {
        const isActive = emp.id === empresaActivaId
        const nombre = emp.nombre_empresa || emp.razon_social
        const multiPV = cuitCount[emp.cuit] > 1

        return (
          <div key={emp.id} className="flex items-stretch">
            <button
              onClick={() => switchEmpresa(emp.id)}
              className={`flex items-center gap-2.5 rounded-l-lg border px-3.5 py-2 text-sm font-medium transition-all ${
                multiPV ? "rounded-l-lg rounded-r-none border-r-0" : "rounded-lg"
              } ${
                isActive
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300 shadow-[0_0_0_1px_rgba(52,211,153,0.3)]"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{nombre}</span>
              {multiPV && (
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-sm bg-muted/60 text-muted-foreground">
                  PV {String(emp.punto_venta).padStart(4, "0")}
                </span>
              )}
              {isActive && (
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm ${
                    emp.ambiente === "produccion"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {emp.ambiente === "produccion" ? "PROD" : "HOMO"}
                </span>
              )}
            </button>
            {/* Boton "+" para clonar como nuevo PV */}
            <button
              onClick={() => cloneEmpresa(emp.id)}
              title={`Nuevo punto de venta para ${emp.razon_social}`}
              className={`flex items-center justify-center w-7 border border-l-0 rounded-r-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors ${
                isActive ? "border-emerald-500/60 bg-emerald-500/5" : "border-border bg-card"
              }`}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )
      })}
      <button
        onClick={() => {
          setConfigForm(EMPTY_CONFIG_FORM())
          setCloningFrom(null)
          setActiveTab("config")
        }}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Nueva empresa
      </button>
    </div>
  )
}
