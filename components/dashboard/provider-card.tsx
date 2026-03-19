import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity, CheckCircle2, AlertCircle } from "lucide-react"
import type { Provider } from "./types"

interface ProviderCardProps {
  providers: Provider[]
  loading: boolean
}

export function ProviderCard({ providers, loading }: ProviderCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Proveedores
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : providers.length > 0 ? (
          <div className="space-y-3">
            {providers.map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.products_count.toLocaleString()} productos &middot; stock: {p.stock_total.toLocaleString()}
                  </p>
                </div>
                <ProviderStatusBadge status={p.last_status} isActive={p.is_active} />
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">Sin proveedores configurados</p>
        )}
      </CardContent>
    </Card>
  )
}

function ProviderStatusBadge({ status, isActive }: { status: string | null; isActive: boolean }) {
  if (status === "completed") {
    return (
      <Badge variant="outline" className="gap-1 border-green-500/30 text-green-500">
        <CheckCircle2 className="h-3 w-3" /> OK
      </Badge>
    )
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="gap-1 border-red-500/30 text-red-500">
        <AlertCircle className="h-3 w-3" /> Error
      </Badge>
    )
  }
  return <Badge variant="outline">{isActive ? "Activo" : "Inactivo"}</Badge>
}
