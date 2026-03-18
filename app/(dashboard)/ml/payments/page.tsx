"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CreditCard } from "lucide-react"

export default function MLPaymentsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <div className="rounded-full bg-muted/30 p-6">
        <CreditCard className="h-12 w-12 text-muted-foreground/50" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Pagos ML</h1>
        <p className="text-muted-foreground max-w-sm">
          La vista de pagos integrada está en desarrollo. Por ahora podés usar la vista global de pagos.
        </p>
      </div>
      <Button asChild>
        <Link href="/pagos">Ver pagos globales</Link>
      </Button>
    </div>
  )
}
