import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

const ACTIONS = [
  { href: "/inventory", label: "Ver inventario" },
  { href: "/ml/publications", label: "Publicaciones ML" },
  { href: "/shopify/config", label: "Exportar a Shopify" },
  { href: "/envios", label: "Panel de envíos" },
  { href: "/billing", label: "Facturación" },
  { href: "/integrations", label: "Integraciones" },
] as const

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Acciones rápidas</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ACTIONS.map((action) => (
          <Button key={action.href} asChild variant="outline" className="justify-between bg-transparent">
            <Link href={action.href}>
              {action.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
