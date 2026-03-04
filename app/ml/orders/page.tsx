"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ShoppingBag } from "lucide-react"

export default function MLOrdersPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <div className="rounded-full bg-muted/30 p-6">
        <ShoppingBag className="h-12 w-12 text-muted-foreground/50" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Ventas ML</h1>
        <p className="text-muted-foreground max-w-sm">
          La vista de ventas integrada está en desarrollo. Por ahora podés usar la vista global de ventas.
        </p>
      </div>
      <Button asChild>
        <Link href="/orders">Ver ventas globales</Link>
      </Button>
    </div>
  )
}
