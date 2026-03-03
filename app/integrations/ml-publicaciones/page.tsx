"use client"

import { useState, useEffect, useCallback } from "react"
import { Button }  from "@/components/ui/button"
import { Badge }   from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertTriangle, ExternalLink, RefreshCw, Zap, ChevronLeft, ChevronRight,
  ShoppingBag, BookOpen, CheckCircle2,
} from "lucide-react"
import Image from "next/image"

// Filtros extraídos del panel de ML
const TASK_OPTS = [
  {
    value: "BUYBOX_STATUS_COMPETING_MARKETPLACE",
    label: "Elegibles para competir",
    description: "Compiten en el buybox — pueden publicarse en catálogo para reactivarse",
    color: "text-amber-400",
    bg:    "bg-amber-500/10 border-amber-500/20",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  {
    value: "UNDER_REVIEW_WAITING_FOR_PATCH_MARKETPLACE",
    label: "Esperando catálogo",
    description: "Bajo revisión — necesitan crear o asociar publicación de catálogo para continuar activas",
    color: "text-red-400",
    bg:    "bg-red-500/10 border-red-500/20",
    badgeClass: "bg-red-500/15 text-red-300 border-red-500/30",
  },
]

interface ListingItem {
  id:                 string
  title:              string
  price:              number
  status:             string
  health:             string | null
  thumbnail:          string | null
  catalog_product_id: string | null
  catalog_listing:    boolean
  listing_type_id:    string
  permalink:          string | null
}

type OptinState = "idle" | "loading" | "done" | "error"

export default function MLPublicacionesPage() {
  const [accounts,      setAccounts]      = useState<{ id: string; nickname: string }[]>([])
  const [activeAccount, setActiveAccount] = useState("")
  const [activeTask,    setActiveTask]    = useState(TASK_OPTS[0].value)
  const [items,         setItems]         = useState<ListingItem[]>([])
  const [total,         setTotal]         = useState(0)
  const [offset,        setOffset]        = useState(0)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [optinStates,   setOptinStates]   = useState<Record<string, OptinState>>({})
  const [optinMessages, setOptinMessages] = useState<Record<string, string>>({})

  const LIMIT = 20

  // Cargar cuentas ML disponibles
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
      const res  = await fetch(
        `/api/mercadolibre/listings-health?account_id=${activeAccount}&task=${activeTask}&limit=${LIMIT}&offset=${offset}`
      )
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
  }, [activeAccount, activeTask, offset])

  useEffect(() => {
    if (activeAccount) loadItems()
  }, [activeAccount, activeTask, offset, loadItems])

  // Reset offset when filter changes
  const handleTaskChange = (val: string) => {
    setActiveTask(val)
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

  // Opt-in al catálogo de ML
  const handleOptin = async (item: ListingItem) => {
    setOptinStates(s => ({ ...s, [item.id]: "loading" }))
    try {
      const res  = await fetch("/api/mercadolibre/catalog-optin", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ account_id: activeAccount, item_id: item.id }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setOptinStates(s => ({ ...s, [item.id]: "done" }))
        setOptinMessages(m => ({ ...m, [item.id]: "Opt-in solicitado correctamente" }))
      } else {
        setOptinStates(s => ({ ...s, [item.id]: "error" }))
        setOptinMessages(m => ({ ...m, [item.id]: data.error || "Error al hacer opt-in" }))
      }
    } catch (e: any) {
      setOptinStates(s => ({ ...s, [item.id]: "error" }))
      setOptinMessages(m => ({ ...m, [item.id]: e.message }))
    }
  }

  const activeOpt = TASK_OPTS.find(t => t.value === activeTask) || TASK_OPTS[0]
  const totalPages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
            <ShoppingBag className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Publicaciones MercadoLibre</h1>
            <p className="text-sm text-muted-foreground">
              Publicaciones que requieren acción para competir o reactivarse en catálogo
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Cuenta */}
        {accounts.length > 1 && (
          <Select value={activeAccount} onValueChange={handleAccountChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Cuenta ML" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.nickname}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Tabs de tipo de alerta */}
        <div className="flex gap-2">
          {TASK_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleTaskChange(opt.value)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                activeTask === opt.value
                  ? `${opt.bg} ${opt.color} border-opacity-100`
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadItems()}
          disabled={loading}
          className="ml-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Descripción del filtro activo */}
      <div className={`mb-4 flex items-start gap-2 rounded-lg border p-3 ${activeOpt.bg}`}>
        <AlertTriangle className={`h-4 w-4 mt-0.5 ${activeOpt.color}`} />
        <p className={`text-sm ${activeOpt.color}`}>{activeOpt.description}</p>
      </div>

      {/* Sin cuenta conectada */}
      {accounts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">No hay cuentas de MercadoLibre conectadas</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Conectá una cuenta en Integraciones → Configuración</p>
          <Button asChild variant="outline" className="mt-4">
            <a href="/integrations">Ir a Integraciones</a>
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {/* Lista de publicaciones */}
      {!loading && !error && items.length === 0 && accounts.length > 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-400/50 mb-4" />
          <p className="font-medium text-muted-foreground">No hay publicaciones en esta categoría</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Todo en orden por ahora</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {/* Contador */}
          <p className="text-xs text-muted-foreground mb-3">
            Mostrando {offset + 1}–{Math.min(offset + LIMIT, total)} de {total} publicaciones
          </p>

          {items.map(item => {
            const state   = optinStates[item.id]   || "idle"
            const message = optinMessages[item.id] || ""

            return (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-card/80"
              >
                {/* Thumbnail */}
                <div className="relative h-14 w-14 flex-none rounded-md overflow-hidden bg-muted/30">
                  {item.thumbnail ? (
                    <Image
                      src={item.thumbnail.replace("http://", "https://")}
                      alt={item.title}
                      fill
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <BookOpen className="h-5 w-5 text-muted-foreground/30" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground font-mono">{item.id}</span>
                    <span className="text-xs font-semibold">
                      ${item.price?.toLocaleString("es-AR")}
                    </span>
                    {item.catalog_listing && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-400 border-emerald-500/30">
                        En catálogo
                      </Badge>
                    )}
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${activeOpt.badgeClass}`}>
                      {activeOpt.label}
                    </Badge>
                  </div>
                  {message && (
                    <p className={`text-[10px] mt-0.5 ${state === "error" ? "text-destructive" : "text-emerald-400"}`}>
                      {message}
                    </p>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 flex-none">
                  {item.permalink && (
                    <Button variant="ghost" size="sm" asChild className="h-8 px-2">
                      <a href={item.permalink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  {state === "done" ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />Solicitado
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={state === "loading" || item.catalog_listing}
                      onClick={() => handleOptin(item)}
                      className="h-8 text-xs gap-1"
                    >
                      <Zap className="h-3 w-3" />
                      {state === "loading" ? "..." : "Opt-in catálogo"}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Pág. {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + LIMIT >= total || loading}
                onClick={() => setOffset(o => o + LIMIT)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
