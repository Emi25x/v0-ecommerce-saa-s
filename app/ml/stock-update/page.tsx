"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Loader2, Play, FileText, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"

interface UpdateResult {
  dry_run: boolean
  account: string
  account_id: string
  file_url: string
  delimiter: string
  columns: { ean: string; stock: string }
  file_eans: number
  publications_with_ean: number
  summary: { updated: number; skipped: number; not_found: number; errors: number }
  parse_errors?: string[]
  details?: Array<{
    ml_item_id: string
    ean: string
    old_stock: number
    new_stock: number
    status: "updated" | "skipped" | "error"
    error?: string
  }>
  error?: string
}

export default function StockUpdatePage() {
  const [accountId, setAccountId] = useState("libroide_argentina")
  const [url, setUrl] = useState("https://mayorista.libroide.com/datos/actuweb/ListadoArgentinafotos.txt")
  const [dryRun, setDryRun] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UpdateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch("/api/ml/update-stock-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, url, dry_run: dryRun }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Error ${res.status}`)
        if (data.headers) setResult(data)
        return
      }

      setResult(data)
    } catch (err: any) {
      setError(err.message || "Error de conexion")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Actualizar Stock desde URL</h1>
        <p className="text-muted-foreground mt-1">
          Actualiza el stock de publicaciones de ML directamente desde un archivo externo, matcheando por EAN.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuracion</CardTitle>
          <CardDescription>
            Ingresa la cuenta de ML y la URL del archivo de stock
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="account_id">Cuenta ML (nickname o UUID)</Label>
              <Input
                id="account_id"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="libroide_argentina"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                id="dry_run"
                checked={dryRun}
                onCheckedChange={setDryRun}
              />
              <Label htmlFor="dry_run" className="cursor-pointer">
                Dry Run {dryRun ? (
                  <Badge variant="secondary" className="ml-2">Solo simular</Badge>
                ) : (
                  <Badge variant="destructive" className="ml-2">Actualizar ML</Badge>
                )}
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL del archivo</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="font-mono text-sm"
            />
          </div>

          <Button onClick={handleRun} disabled={loading || !accountId || !url} className="w-full md:w-auto">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {dryRun ? "Simulando..." : "Actualizando..."}
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                {dryRun ? "Simular (Dry Run)" : "Actualizar Stock"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {result && !result.error && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Resultado {result.dry_run && <Badge variant="secondary">DRY RUN</Badge>}
              </CardTitle>
              <CardDescription>
                Cuenta: {result.account} | Delimitador: {result.delimiter} | Columnas: EAN="{result.columns.ean}", Stock="{result.columns.stock}"
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-2xl font-bold">{result.file_eans}</div>
                  <div className="text-xs text-muted-foreground">EANs en archivo</div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-2xl font-bold">{result.publications_with_ean}</div>
                  <div className="text-xs text-muted-foreground">Publicaciones con EAN</div>
                </div>
                <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-3">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400">{result.summary.updated}</div>
                  <div className="text-xs text-muted-foreground">{result.dry_run ? "A actualizar" : "Actualizados"}</div>
                </div>
                <div className="rounded-lg bg-yellow-100 dark:bg-yellow-900/30 p-3">
                  <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{result.summary.skipped}</div>
                  <div className="text-xs text-muted-foreground">Sin cambios</div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-2xl font-bold">{result.summary.not_found}</div>
                  <div className="text-xs text-muted-foreground">No encontrados</div>
                </div>
              </div>
              {result.summary.errors > 0 && (
                <div className="mt-3 rounded-lg bg-red-100 dark:bg-red-900/30 p-3 text-center">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-400">{result.summary.errors}</div>
                  <div className="text-xs text-muted-foreground">Errores</div>
                </div>
              )}
            </CardContent>
          </Card>

          {result.details && result.details.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detalle ({result.details.length} items)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr>
                        <th className="text-left py-2 px-2">ML Item</th>
                        <th className="text-left py-2 px-2">EAN</th>
                        <th className="text-right py-2 px-2">Stock Ant.</th>
                        <th className="text-right py-2 px-2">Stock Nuevo</th>
                        <th className="text-center py-2 px-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.details.map((item, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5 px-2 font-mono text-xs">{item.ml_item_id}</td>
                          <td className="py-1.5 px-2 font-mono text-xs">{item.ean}</td>
                          <td className="py-1.5 px-2 text-right">{item.old_stock}</td>
                          <td className="py-1.5 px-2 text-right font-medium">{item.new_stock}</td>
                          <td className="py-1.5 px-2 text-center">
                            {item.status === "updated" && <CheckCircle2 className="h-4 w-4 text-green-600 inline" />}
                            {item.status === "skipped" && <span className="text-yellow-600">-</span>}
                            {item.status === "error" && (
                              <span title={item.error}><XCircle className="h-4 w-4 text-red-600 inline" /></span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
