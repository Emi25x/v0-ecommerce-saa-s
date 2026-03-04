"use client"

import { useState, useEffect, useCallback } from "react"
import { Button }  from "@/components/ui/button"
import { Badge }   from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, ExternalLink, RefreshCw, Zap, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react"

// Re-usa la misma lógica de /integrations/ml-publicaciones
// Importa el componente directamente para no duplicar código
import MLPublicacionesPage from "@/app/integrations/ml-publicaciones/page"

export default function MLPublicationsAlertsPage() {
  return <MLPublicacionesPage />
}
