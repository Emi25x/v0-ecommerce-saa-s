"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Play, FileText, AlertTriangle, CheckCircle2, XCircle, MinusCircle } from "lucide-react"

interface MlAccount {
  id: string
  nickname: string
  ml_user_id: string
}

interface DetailItem {
  ml_item_id: string
  ean: string
  sku?: string
  title?: string
  old_stock: number
  new_stock: number
  status: "updated" | "skipped" | "error" | "not_found" | "zeroed"
  error?: string
}

interface UpdateResult {
  dry_run: boolean
  zero_missing: boolean
  account: string
  account_id: string
  file_url: string
  delimiter: string
  columns: { ean: string; stock: string }
  file_eans: number
  publications_with_ean: number
  summary: { updated: number; skipped: number; not_found: number; zeroed: number; errors: number }
  parse_errors?: string[]
  details?: DetailItem[]
  not_found_details?: DetailItem[]
  zeroed_details?: DetailItem[]
  error?: string
}

export default function StockUpdatePage() {
  const [accounts, setAccounts] = useState<MlAccount[]>([])
  const [accountId, setAccountId] = useState("")
  const [url, setUrl] = useState("https://mayorista.libroide.com/datos/actuweb/ListadoArgentinafotos.txt")
  const [dryRun, setDryRun] = useState(true)
  const [zeroMissing, setZeroMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [result, setResult] = useState<UpdateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"details" | "not_found" | "zeroed">("details")

  useEffect(() => {
    fetch("/api/ml/accounts")
      .then(res => res.json())
      .then(data => {
        const list = data.accounts || data || []
        setAccounts(list)
        const libroide = list.find((a: MlAccount) => a.nickname?.toLowerCase().includes("libroide"))
        if (libroide) setAccountId(libroide.nickname)
        else if (list.length > 0) setAccountId(list[0].nickname)
      })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false))
  }, [])

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setActiveTab("details")

    try {
      const res = await fetch("/api/ml/update-stock-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, url, dry_run: dryRun, zero_missing: zeroMissing }),
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

  const renderTable = (items: DetailItem[]) => (
    <div className="max-h-96 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background border-b">
          <tr>
            <th className="text-left py-2 px-2">ML Item</th>
            <th className="text-left py-2 px-2">SKU</th>
            <th className="text-left py-2 px-2">EAN</th>
            <th className="text-left py-2 px-2 hidden lg:table-cell">Titulo</th>
            <th className="text-right py-2 px-2">Ant.</th>
            <th className="text-right py-2 px-2">Nuevo</th>
            <th className="text-center py-2 px-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-1.5 px-2 font-mono text-xs">{item.ml_item_id || "-"}</td>
              <td className="py-1.5 px-2 font-mono text-xs">{item.sku || "-"}</td>
              <td className="py-1.5 px-2 font-mono text-xs">{item.ean}</td>
              <td className="py-1.5 px-2 text-xs truncate max-w-[200px] hidden lg:table-cell" title={item.title}>{item.title || "-"}</td>
              <td className="py-1.5 px-2 text-right">{item.old_stock}</td>
              <td className="py-1.5 px-2 text-right font-medium">{item.new_stock}</td>
              <td className="py-1.5 px-2 text-center">
                {item.status === "updated" && <CheckCircle2 className="h-4 w-4 text-green-600 inline" />}
                {item.status === "skipped" && <span className="text-yellow-600">-</span>}
                {item.status === "zeroed" && <MinusCircle className="h-4 w-4 text-orange-500 inline" />}
                {item.status === "not_found" && <span className="text-muted-foreground">?</span>}
                {item.status === "error" && (
                  <span title={item.error}><XCircle className="h-4 w-4 text-red-600 inline" /></span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="container mx-auto max-w-5xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Actualizar Stock desde URL</h1>
        <p className="text-muted-foreground mt-1">
          Actualiza el stock de publicaciones de ML directamente desde un archivo externo, matcheando por EAN/SKU.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuracion</CardTitle>
          <CardDescription>
            Selecciona la cuenta de ML y la URL del archivo de stock
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cuenta ML</Label>
              {loadingAccounts ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground h-10">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando cuentas...
                </div>
              ) : (
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.nickname}>
                        {acc.nickname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-3">
                <Switch id="dry_run" checked={dryRun} onCheckedChange={setDryRun} />
                <Label htmlFor="dry_run" className="cursor-pointer">
                  Dry Run {dryRun ? (
                    <Badge variant="secondary" className="ml-2">Solo simular</Badge>
                  ) : (
                    <Badge variant="destructive" className="ml-2">Actualizar ML</Badge>
                  )}
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="zero_missing" checked={zeroMissing} onCheckedChange={setZeroMissing} />
                <Label htmlFor="zero_missing" className="cursor-pointer">
                  Poner en 0 los que no estan en el archivo
                  {zeroMissing && <Badge variant="outline" className="ml-2 text-orange-500 border-orange-500">Activado</Badge>}
                </Label>
              </div>
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
                Cuenta: {result.account} | Delimitador: {result.delimiter} | Columnas: EAN=&quot;{result.columns.ean}&quot;, Stock=&quot;{result.columns.stock}&quot;
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-2xl font-bold">{result.file_eans}</div>
                  <div className="text-xs text-muted-foreground">EANs en archivo</div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-2xl font-bold">{result.publications_with_ean}</div>
                  <div className="text-xs text-muted-foreground">Publicaciones</div>
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
                {result.summary.zeroed > 0 && (
                  <div className="rounded-lg bg-orange-100 dark:bg-orange-900/30 p-3">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{result.summary.zeroed}</div>
                    <div className="text-xs text-muted-foreground">{result.dry_run ? "A poner en 0" : "Puestos en 0"}</div>
                  </div>
                )}
              </div>
              {result.summary.errors > 0 && (
                <div className="mt-3 rounded-lg bg-red-100 dark:bg-red-900/30 p-3 text-center">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-400">{result.summary.errors}</div>
                  <div className="text-xs text-muted-foreground">Errores</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={activeTab === "details" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTab("details")}
                >
                  Actualizados ({result.details?.length || 0})
                </Button>
                <Button
                  variant={activeTab === "not_found" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTab("not_found")}
                >
                  No encontrados ({result.not_found_details?.length || 0})
                </Button>
                {(result.zeroed_details?.length || 0) > 0 && (
                  <Button
                    variant={activeTab === "zeroed" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTab("zeroed")}
                  >
                    Puestos en 0 ({result.zeroed_details?.length || 0})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {activeTab === "details" && result.details && result.details.length > 0 && renderTable(result.details)}
              {activeTab === "details" && (!result.details || result.details.length === 0) && (
                <p className="text-sm text-muted-foreground">No hay items para mostrar</p>
              )}
              {activeTab === "not_found" && result.not_found_details && result.not_found_details.length > 0 && renderTable(result.not_found_details)}
              {activeTab === "not_found" && (!result.not_found_details || result.not_found_details.length === 0) && (
                <p className="text-sm text-muted-foreground">Todos los EANs del archivo fueron encontrados</p>
              )}
              {activeTab === "zeroed" && result.zeroed_details && result.zeroed_details.length > 0 && renderTable(result.zeroed_details)}
              {activeTab === "zeroed" && (!result.zeroed_details || result.zeroed_details.length === 0) && (
                <p className="text-sm text-muted-foreground">No hay items puestos en 0</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
