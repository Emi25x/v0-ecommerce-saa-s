"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { RefreshCw, Wifi, WifiOff } from "lucide-react"

interface MLConnectionStatusProps {
  accountId: string
  onRefresh?: () => void
  refreshing?: boolean
}

export function MLConnectionStatus({ accountId, onRefresh, refreshing = false }: MLConnectionStatusProps) {
  const [status, setStatus] = useState<{
    connected: boolean
    nickname?: string
    tokenExpired?: boolean
    loading: boolean
  }>({
    connected: false,
    loading: true,
  })

  useEffect(() => {
    checkConnectionStatus()
  }, [accountId])

  async function checkConnectionStatus() {
    if (!accountId || accountId === "all") {
      setStatus({ connected: true, loading: false })
      return
    }

    try {
      setStatus((prev) => ({ ...prev, loading: true }))
      const response = await fetch(`/api/mercadolibre/accounts/${accountId}/status`)

      if (response.ok) {
        const data = await response.json()
        setStatus({
          connected: data.connected && !data.tokenExpired,
          nickname: data.nickname,
          tokenExpired: data.tokenExpired,
          loading: false,
        })
      } else {
        setStatus({ connected: false, loading: false })
      }
    } catch (error) {
      console.error("Error checking connection status:", error)
      setStatus({ connected: false, loading: false })
    }
  }

  if (accountId === "all") {
    return null
  }

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              {status.loading ? (
                <div className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1">
                  <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Verificando...</span>
                </div>
              ) : status.connected ? (
                <div className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 dark:border-green-900 dark:bg-green-950">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <Wifi className="h-3 w-3 text-green-600 dark:text-green-400" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">Conectado</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 dark:border-red-900 dark:bg-red-950">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  <WifiOff className="h-3 w-3 text-red-600 dark:text-red-400" />
                  <span className="text-xs font-medium text-red-700 dark:text-red-300">Desconectado</span>
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {status.loading
                ? "Verificando estado de conexión..."
                : status.connected
                  ? `Conexión activa con ${status.nickname || "MercadoLibre"}`
                  : status.tokenExpired
                    ? "Token expirado. Reconecta tu cuenta en Integraciones"
                    : "Sin conexión. Verifica tu cuenta en Integraciones"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {onRefresh && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      )}
    </div>
  )
}
