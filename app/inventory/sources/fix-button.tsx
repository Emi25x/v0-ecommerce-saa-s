"use client"

import { Button } from "@/components/ui/button"
import { XCircle } from "lucide-react"

export function FixStuckImportsButton() {
  const handleFix = async () => {
    if (!confirm("¿Cancelar todas las importaciones en curso?")) return

    const res = await fetch("/api/inventory/fix-stuck", { method: "POST" })
    const data = await res.json()

    if (data.success) {
      alert(`Se cancelaron ${data.fixed} importaciones`)
      window.location.reload()
    } else {
      alert("Error: " + data.error)
    }
  }

  return (
    <Button onClick={handleFix} variant="destructive" size="sm">
      <XCircle className="h-4 w-4 mr-2" />
      Cancelar atascadas
    </Button>
  )
}
