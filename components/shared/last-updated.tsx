"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"

interface LastUpdatedProps {
  timestamp: Date | null
  isLoading?: boolean
  onRefresh?: () => void
}

export function LastUpdated({ timestamp, isLoading, onRefresh }: LastUpdatedProps) {
  const [timeAgo, setTimeAgo] = useState<string>("")

  useEffect(() => {
    if (!timestamp) {
      setTimeAgo("")
      return
    }

    const updateTimeAgo = () => {
      const now = new Date()
      const diff = now.getTime() - timestamp.getTime()
      const seconds = Math.floor(diff / 1000)
      const minutes = Math.floor(seconds / 60)
      const hours = Math.floor(minutes / 60)
      const days = Math.floor(hours / 24)

      if (days > 0) {
        setTimeAgo(`hace ${days} día${days > 1 ? "s" : ""}`)
      } else if (hours > 0) {
        setTimeAgo(`hace ${hours} hora${hours > 1 ? "s" : ""}`)
      } else if (minutes > 0) {
        setTimeAgo(`hace ${minutes} minuto${minutes > 1 ? "s" : ""}`)
      } else {
        setTimeAgo("hace unos segundos")
      }
    }

    updateTimeAgo()
    const interval = setInterval(updateTimeAgo, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [timestamp])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span>Actualizando...</span>
      </div>
    )
  }

  if (!timestamp) {
    return null
  }

  return (
    <div className="flex items-center gap-2">
      <div className="text-sm text-muted-foreground">
        Última actualización: <span className="font-medium">{timeAgo}</span>
      </div>
      {onRefresh && (
        <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 px-2">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
