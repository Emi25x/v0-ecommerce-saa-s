import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface KpiCardProps {
  title: string
  value?: number
  icon: React.ComponentType<{ className?: string }>
  loading: boolean
  href: string
  detail?: string
}

export function KpiCard({ title, value, icon: Icon, loading, href, detail }: KpiCardProps) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-20" />
            ) : (
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold">{(value ?? 0).toLocaleString()}</p>
                {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
