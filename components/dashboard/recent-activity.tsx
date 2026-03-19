import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { ProcessRun } from "./types"

interface RecentActivityProps {
  runs: ProcessRun[]
}

export function RecentActivity({ runs }: RecentActivityProps) {
  if (runs.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actividad reciente</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {runs.slice(0, 8).map((run, i) => (
            <div
              key={`${run.process_type}-${run.started_at}-${i}`}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">{run.process_name || run.process_type}</span>
                {run.rows_processed != null && (
                  <span className="ml-2 text-muted-foreground">{run.rows_processed.toLocaleString()} filas</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {run.duration_ms != null && (
                  <span className="text-xs text-muted-foreground">{(run.duration_ms / 1000).toFixed(1)}s</span>
                )}
                <RunStatusBadge status={run.status} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function RunStatusBadge({ status }: { status: string }) {
  const styles =
    status === "completed"
      ? "border-green-500/30 text-green-500"
      : status === "failed"
        ? "border-red-500/30 text-red-500"
        : "border-blue-500/30 text-blue-500"

  const label = status === "completed" ? "OK" : status === "failed" ? "Error" : status

  return (
    <Badge variant="outline" className={styles}>
      {label}
    </Badge>
  )
}
