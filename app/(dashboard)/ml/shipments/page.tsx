"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Truck } from "lucide-react"

export default function MLShipmentsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <div className="rounded-full bg-muted/30 p-6">
        <Truck className="h-12 w-12 text-muted-foreground/50" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Envíos ML</h1>
        <p className="text-muted-foreground max-w-sm">
          La vista de envíos integrada está en desarrollo. Por ahora podés usar la vista global de envíos.
        </p>
      </div>
      <Button asChild>
        <Link href="/shipments">Ver envíos globales</Link>
      </Button>
    </div>
  )
}
