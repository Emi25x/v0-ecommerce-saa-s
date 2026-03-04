"use client"

import { useState, useEffect, useCallback } from "react"
import { Button }  from "@/components/ui/button"
import { Badge }   from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertTriangle, ExternalLink, RefreshCw, Zap, ChevronLeft, ChevronRight, CheckCircle2,
} from "lucide-react"
import Image from "next/image"

// Modos de búsqueda con sus endpoints correctos de ML
const MODES = [
  {
    value:       "eligible",
    label:       "Elegibles para catálogo",
    description: "Publicaciones activas con competencia en catálogo — podés hacer opt-in para competir directamente",
    color:       "text-emerald-400",
    bg:          "bg-emerald-500/10 border-emerald-500/20",
    badgeClass:  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  {
    value:       "forewarning",
    label:       "Próximas a pausarse",
    description: "Publicaciones que ML detectó que deben migrar al catálogo o serán pausadas",
    color:       "text-amber-400",
    bg:          "bg-amber-500/10 border-amber-500/20",
    badgeClass:  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  {
    value:       "under_review",
    label:       "Bajo revisión",
    description: "Publicaciones pausadas esperando publicación de catálogo para reactivarse",
    color:       "text-red-400",
    bg:          "bg-red-500/10 border-red-500/20",
    badgeClass:  "bg-red-500/15 text-red-300 border-red-500/30",
  },
]

interface ListingItem {
  id:                 string
  title:              string
  price:              number
  status:             string
  sub_status:         string | null
  health:             string | null
  thumbnail:          string | null
  catalog_product_id: string | null
  catalog_listing:    boolean
  listing_type_id:    string
  tags:               string[]
  permalink:          string | null
}

type OptinState = "idle" | "loading" | "done" | "error"

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)

export default function MLPublicacionesPage() {
  const [accounts,      setAccounts]      = useState<{ id: string; nickname: string }[]>([])
  const [activeAccount, setActiveAccount] = useState("")
  const [activeMode,    setActiveMode]    = useState(MODES[0].value)
  const [items,         setItems]         = useState<ListingItem[]>([])
  const [total,         setTotal]         = useState(0)
  const [offset,        setOffset]        = useState(0)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [optinStates,   setOptinStates]   = useState<Record<string, OptinState>>({})
  const [optinMessages, setOptinMessages] = useState<Record<string, string>>({})

  const LIMIT = 20

  useEffect(() => {
    fetch("/api/ml/accounts")
      .then(r => r.json())
      .then(d => {
        if (d.accounts?.length) {
          setAccounts(d.accounts)
          setActiveAccount(d.accounts[0].id)
        }
      })
      .catch(() => {})
  }, [])

  const loadItems = useCallback(async () => {
    if (!activeAccount) return
    setLoading(true)
    setError(null)
    try {
      const url  = `/api/mercadolibre/listings-health?account_id=${activeAccount}&mode=${activeMode}&limit=${LIMIT}&offset=${offset}`
      const res  = await fetch(url)
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Error al cargar publicaciones")
        setItems([])
        return
      }
      setItems(data.items)
      setTotal(data.total)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [activeAccount, activeMode, offset])

  useEffect(() => {
    if (activeAccount) loadItems()
  }, [activeAccount, activeMode, offset, loadItems])

  const handleModeChange = (val: string) => {
    setActiveMode(val)
    setOffset(0)
    setOptinStates({})
    setOptinMessages({})
  }

  const handleAccountChange = (val: string) => {
    setActiveAccount(val)
    setOffset(0)
    setOptinStates({})
    setOptinMessages({})
  }

  const handleOptin = async (item: ListingItem) => {
    setOptinStates(s => ({ ...s, [item.id]: "loading" }))
    try {
      const res  = await fetch("/api/mercadolibre/catalog-optin", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ item_id: item.id, account_id: activeAccount }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setOptinStates(s  => ({ ...s,  [item.id]: "done" }))
        setOptinMessages(m => ({ ...m, [item.id]: "Opt-in solicitado. ML revisará la publicación." }))
        setTimeout(() => loadItems(), 2500)
      } else {
        setOptinStates(s  => ({ ...s,  [item.id]: "error" }))
        const msg = data.status
          ? `No elegible (${data.status}): ${data.error}`
          : (data.error || "Error al hacer opt-in")
        setOptinMessages(m => ({ ...m, [item.id]: msg }))
      }
    } catch {
      setOptinStates(s  => ({ ...s,  [item.id]: "error" }))
      setOptinMessages(m => ({ ...m, [item.id]: "Error de red" }))
    }
  }

  const currentMode = MODES.find(m => m.value === activeMode) || MODES[0]
  const totalPages  = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Publicaciones con alertas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Publicaciones que requieren acción para mantenerse activas en Mercado Libre
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        {accounts.length > 1 && (
          <Select value={activeAccount} onValueChange={handleAccountChange}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Cuenta ML" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.nickname}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex gap-2">
          {MODES.map(m => (
            <button
              key={m.value}
              onClick={() => handleModeChange(m.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeMode === m.value
                  ? `${m.bg} ${m.color} border-current`
                  : "bg-transparent text-muted-foreground border-border hover:border-foreground/30"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <Button variant="ghost" size="icon" onClick={loadItems} disabled={loading} className="ml-auto">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Descripción del modo activo */}
      <div className={`rounded-lg border px-4 py-3 text-sm flex gap-2 items-start ${currentMode.bg}`}>
        <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${currentMode.color}`} />
        <div>
          <span className={`font-medium ${currentMode.color}`}>{currentMode.label}</span>
          <span className="text-muted-foreground ml-2">{currentMode.description}</span>
          <span className="ml-2 text-muted-foreground/50 text-xs font-mono">[{currentMode.endpoint}]</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Conteo */}
      {!loading && !error && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total.toLocaleString("es-AR")} publicaciones encontradas</span>
          {total > LIMIT && (
            <span>Página {currentPage} de {totalPages}</span>
          )}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
          <p className="font-medium">No hay publicaciones en este estado</p>
          <p className="text-sm text-muted-foreground mt-1">
            {currentMode.value === "forewarning"
              ? "Ninguna publicación próxima a pausarse por catálogo"
              : "No hay publicaciones bajo revisión esperando catálogo"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const state = optinStates[item.id]  || "idle"
            const msg   = optinMessages[item.id] || ""
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3"
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                  {item.thumbnail ? (
                    <Image
                      src={item.thumbnail.replace("http://", "https://")}
                      alt={item.title}
                      width={56} height={56}
                      className="object-cover w-full h-full"
                      unoptimized
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">Sin img</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-tight line-clamp-2">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
                    <span className="text-sm font-semibold">{fmt(item.price)}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${currentMode.badgeClass}`}>
                      {currentMode.label}
                    </Badge>
                    {item.catalog_listing && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-green-500/15 text-green-400 border-green-500/30">
                        Ya en catálogo
                      </Badge>
                    )}
                    {item.sub_status && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground">
                        {item.sub_status}
                      </Badge>
                    )}
                  </div>
                  {msg && (
                    <p className={`text-xs mt-1 ${state === "error" ? "text-red-400" : "text-green-400"}`}>
                      {msg}
                    </p>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 shrink-0">
                  {item.permalink && (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-border p-2 hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </a>
                  )}
                  {!item.catalog_listing && (
                    <Button
                      size="sm"
                      variant={state === "done" ? "outline" : "default"}
                      disabled={state === "loading" || state === "done"}
                      onClick={() => handleOptin(item)}
                      className="gap-1.5"
                    >
                      {state === "loading" ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : state === "done" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      {state === "done" ? "Solicitado" : "Opt-in catálogo"}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginación */}
      {total > LIMIT && !loading && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline" size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline" size="sm"
            disabled={offset + LIMIT >= total}
            onClick={() => setOffset(offset + LIMIT)}
          >
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  )
}
