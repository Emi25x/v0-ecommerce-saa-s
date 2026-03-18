"use client"

import { useState, useEffect, useCallback } from "react"
import { Button }  from "@/components/ui/button"
import { Badge }   from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, ExternalLink, RefreshCw, Zap, CheckCircle2, ChevronRight } from "lucide-react"

interface ListingItem {
  id:                    string
  title:                 string
  price:                 number
  status:                string
  health:                string | null
  thumbnail:             string | null
  category_id:           string
  catalog_product_id:    string | null
  catalog_listing:       boolean
  catalog_optin_eligible: boolean
  permalink:             string | null
}

interface MLAccount {
  id:       string
  nickname: string
}

interface Props {
  accounts: MLAccount[]
}

const HEALTH_OPTS = [
  { value: "soon_to_be_paused",   label: "Próximas a pausarse",      color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
  { value: "catalog_not_listed",  label: "Elegibles para catálogo",  color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
]

export function MLListingsHealth({ accounts }: Props) {
  const [activeAccount, setActiveAccount] = useState(accounts[0]?.id || "")
  const [healthFilter,  setHealthFilter]  = useState("soon_to_be_paused")
  const [items,         setItems]         = useState<ListingItem[]>([])
  const [total,         setTotal]         = useState(0)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [optinStates,   setOptinStates]   = useState<Record<string, "idle" | "loading" | "done" | "error">>({})
  const [optinMessages, setOptinMessages] = useState<Record<string, string>>({})

  const loadItems = useCallback(async () => {
    if (!activeAccount) return
    setLoading(true); setError(null)
    try {
      const res  = await fetch(`/api/mercadolibre/listings-health?account_id=${activeAccount}&health=${healthFilter}`)
      const data = await res.json()
      if (!res.ok || !data.ok) { setError(data.error || "Error cargando publicaciones"); return }
      setItems(data.items)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [activeAccount, healthFilter])

  useEffect(() => { loadItems() }, [loadItems])

  const handleOptin = async (item: ListingItem) => {
    setOptinStates(s => ({ ...s, [item.id]: "loading" }))
    try {
      const res  = await fetch("/api/mercadolibre/catalog-optin", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          account_id:         activeAccount,
          item_id:            item.id,
          catalog_product_id: item.catalog_product_id,
        }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setOptinStates(s  => ({ ...s,  [item.id]: "done" }))
        setOptinMessages(m => ({ ...m, [item.id]: "Opt-in realizado" }))
        // Recargar después de 1.5s para reflejar el cambio
        setTimeout(loadItems, 1500)
      } else {
        setOptinStates(s  => ({ ...s,  [item.id]: "error" }))
        setOptinMessages(m => ({ ...m, [item.id]: data.error || "Error al hacer opt-in" }))
      }
    } catch (e: any) {
      setOptinStates(s  => ({ ...s,  [item.id]: "error" }))
      setOptinMessages(m => ({ ...m, [item.id]: e.message }))
    }
  }

  const activeOpt = HEALTH_OPTS.find(o => o.value === healthFilter)!

  if (!accounts.length) return null

  return (
    <div className="space-y-4">
      {/* Header + controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Publicaciones con alertas</h3>
          <p className="text-sm text-muted-foreground">
            Gestioná las publicaciones próximas a pausarse y realizá el opt-in al catálogo de ML
          </p>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length > 1 && (
            <Select value={activeAccount} onValueChange={setActiveAccount}>
              <SelectTrigger className="h-8 text-xs w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.nickname}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="sm" onClick={loadItems} disabled={loading} className="h-8 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Tabs de filtro */}
      <div className="flex gap-2">
        {HEALTH_OPTS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setHealthFilter(opt.value)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
              healthFilter === opt.value
                ? `${opt.bg} ${opt.color} border-current/30`
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.value === "soon_to_be_paused"
              ? <AlertTriangle className="h-3.5 w-3.5" />
              : <Zap className="h-3.5 w-3.5" />
            }
            {opt.label}
            {healthFilter === opt.value && total > 0 && (
              <span className={`ml-1 text-xs rounded-full px-1.5 py-0.5 bg-current/10`}>
                {total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="rounded-lg border border-border bg-card p-8 flex items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Consultando publicaciones en MercadoLibre...</span>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
          <p className="font-medium">Sin alertas en esta categoría</p>
          <p className="text-sm text-muted-foreground mt-1">
            {healthFilter === "soon_to_be_paused"
              ? "No tenés publicaciones próximas a pausarse"
              : "No tenés publicaciones elegibles para catálogo pendientes"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Banner explicativo */}
          <div className={`px-4 py-2.5 text-xs flex items-center gap-2 ${activeOpt.bg} ${activeOpt.color} border-b border-current/10`}>
            {healthFilter === "soon_to_be_paused"
              ? <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              : <Zap className="h-3.5 w-3.5 flex-shrink-0" />
            }
            {healthFilter === "soon_to_be_paused"
              ? "Estas publicaciones serán pausadas por ML porque no tienen publicación de catálogo. Hacé el opt-in para mantenerlas activas."
              : "Estas publicaciones son elegibles para competir en el catálogo de ML. El opt-in asocia tu publicación tradicional al catálogo."}
          </div>

          {/* Tabla */}
          <div className="divide-y divide-border">
            {items.map(item => {
              const state = optinStates[item.id] || "idle"
              const msg   = optinMessages[item.id]
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  {/* Thumbnail */}
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="h-12 w-12 rounded-md object-contain bg-white flex-shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-muted flex-shrink-0" />
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <Badge
                        variant="outline"
                        className={`flex-shrink-0 text-[10px] h-4 px-1.5 ${
                          item.health === "good" ? "text-emerald-400 border-emerald-500/30"
                          : item.health === "bad" ? "text-red-400 border-red-500/30"
                          : "text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {item.health || item.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground font-mono">{item.id}</span>
                      <span className="text-xs font-medium">
                        {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(item.price)}
                      </span>
                      {item.catalog_product_id && (
                        <span className="text-[10px] text-blue-400 font-mono">Cat: {item.catalog_product_id}</span>
                      )}
                    </div>
                    {msg && (
                      <p className={`text-[10px] mt-0.5 ${state === "done" ? "text-emerald-400" : "text-red-400"}`}>
                        {msg}
                      </p>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.permalink && (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground border border-border hover:border-muted-foreground transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {state === "done" ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium px-3">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Listo
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant={state === "error" ? "destructive" : "default"}
                        disabled={state === "loading" || item.catalog_listing}
                        onClick={() => handleOptin(item)}
                        className="h-8 text-xs gap-1.5"
                      >
                        {state === "loading" ? (
                          <><RefreshCw className="h-3 w-3 animate-spin" /> Procesando...</>
                        ) : item.catalog_listing ? (
                          <><CheckCircle2 className="h-3 w-3" /> Ya en catálogo</>
                        ) : state === "error" ? (
                          <>Reintentar</>
                        ) : (
                          <><ChevronRight className="h-3 w-3" /> Opt-in catálogo</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
