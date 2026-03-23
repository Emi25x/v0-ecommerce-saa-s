"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import {
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileText,
  Package,
  Warehouse,
} from "lucide-react"

interface Account {
  id: string
  nickname: string
  ml_user_id: string
}

interface Template {
  id: string
  name: string
  account_id: string
  is_default: boolean
  listing_type_id: string
  margin_percent: number
  price_profile_id?: string | null
}

interface WarehouseItem {
  id: string
  name: string
  is_default: boolean
  safety_stock: number
}

interface SyncResult {
  success: boolean
  summary?: {
    total_candidates: number
    already_published: number
    published: number
    skipped_no_stock: number
    errors: number
    dry_run: boolean
    run_id: string
    template_id: string
    template_name: string
  }
  results?: Array<{
    product_id: string
    ean: string | null
    title: string | null
    status: "published" | "skipped" | "error"
    ml_item_id?: string
    reason?: string
    error?: string
  }>
  results_truncated?: boolean
  error?: string
}

export default function MLBulkPublishPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([])

  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("")
  const [publishMode, setPublishMode] = useState<string>("linked")
  const [dryRun, setDryRun] = useState(true)
  const [limit, setLimit] = useState<number>(10)

  const [resolvedTemplate, setResolvedTemplate] = useState<Template | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load initial data
  useEffect(() => {
    Promise.all([
      fetch("/api/mercadolibre/accounts").then((r) => r.json()),
      fetch("/api/warehouses").then((r) => r.json()),
    ])
      .then(([accountsData, warehousesData]) => {
        const accs = accountsData.accounts || []
        setAccounts(accs)
        if (accs.length === 1) setSelectedAccount(accs[0].id)

        const whs = warehousesData.warehouses || []
        setWarehouses(whs)
        const defaultWh = whs.find((w: WarehouseItem) => w.is_default)
        if (defaultWh) setSelectedWarehouse(defaultWh.id)
        else if (whs.length > 0) setSelectedWarehouse(whs[0].id)
      })
      .catch(() => setError("Error cargando datos iniciales"))
      .finally(() => setLoading(false))
  }, [])

  // Resolve template when account changes
  const resolveTemplate = useCallback(async () => {
    if (!selectedAccount) {
      setResolvedTemplate(null)
      setTemplates([])
      return
    }

    try {
      const res = await fetch(`/api/ml/templates?account_id=${selectedAccount}`)
      const data = await res.json()
      const accountTemplates: Template[] = data.templates || []
      setTemplates(accountTemplates)

      // Pick default or first template
      const defaultTpl = accountTemplates.find((t) => t.is_default) || accountTemplates[0] || null
      setResolvedTemplate(defaultTpl)
    } catch {
      setResolvedTemplate(null)
      setTemplates([])
    }
  }, [selectedAccount])

  useEffect(() => {
    resolveTemplate()
  }, [resolveTemplate])

  const selectedAccountObj = accounts.find((a) => a.id === selectedAccount)
  const selectedWarehouseObj = warehouses.find((w) => w.id === selectedWarehouse)

  const canPublish = selectedAccount && selectedWarehouse && resolvedTemplate && !publishing

  const runBulkPublish = async () => {
    if (!canPublish) return
    setPublishing(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch("/api/ml/bulk-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccount,
          warehouse_id: selectedWarehouse,
          template_id: resolvedTemplate!.id,
          publish_mode: publishMode,
          dry_run: dryRun,
          limit: limit > 0 ? limit : 0,
        }),
      })
      const data: SyncResult = await res.json()
      setResult(data)
      if (!data.success) {
        setError(data.error || "Error en publicación masiva")
      }
    } catch {
      setError("Error de conexión")
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Publicación Masiva ML</h1>
        <p className="text-muted-foreground mt-1">
          Publica todos los productos con stock disponible en una cuenta de Mercado Libre.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Account selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Cuenta ML
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cuenta..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Warehouse selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Warehouse className="h-4 w-4" />
              Almacén
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar almacén..." />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((wh) => (
                  <SelectItem key={wh.id} value={wh.id}>
                    {wh.name} {wh.is_default ? "(Default)" : ""} — Safety: {wh.safety_stock}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Resolved template display */}
      <Card className={resolvedTemplate ? "border-green-200" : selectedAccount ? "border-orange-200" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Plantilla de publicación
          </CardTitle>
          <CardDescription>
            Se resuelve automáticamente de la cuenta ML seleccionada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedAccount ? (
            <p className="text-sm text-muted-foreground">Seleccioná una cuenta para ver su plantilla.</p>
          ) : resolvedTemplate ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="font-medium">{resolvedTemplate.name}</span>
                {resolvedTemplate.is_default && <Badge variant="secondary">Principal</Badge>}
              </div>
              <div className="text-sm text-muted-foreground grid grid-cols-2 gap-1">
                <span>Tipo: {resolvedTemplate.listing_type_id || "gold_special"}</span>
                <span>Margen: {resolvedTemplate.margin_percent || 20}%</span>
              </div>
              {templates.length > 1 && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground">Cambiar plantilla:</Label>
                  <Select
                    value={resolvedTemplate.id}
                    onValueChange={(id) => {
                      const tpl = templates.find((t) => t.id === id)
                      if (tpl) setResolvedTemplate(tpl)
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((tpl) => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {tpl.name} {tpl.is_default ? "(Principal)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">
                Esta cuenta no tiene plantilla configurada. Creá una en{" "}
                <a href="/integrations/ml-templates" className="underline">
                  Plantillas ML
                </a>
                .
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publish options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Opciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Modo de publicación</Label>
              <Select value={publishMode} onValueChange={setPublishMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linked">Linked (tradicional + catálogo)</SelectItem>
                  <SelectItem value="catalog">Solo catálogo</SelectItem>
                  <SelectItem value="traditional">Solo tradicional</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Límite de productos (0 = todos)</Label>
              <Input
                type="number"
                min={0}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 0)}
              />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <Switch checked={dryRun} onCheckedChange={setDryRun} id="dry-run" />
              <Label htmlFor="dry-run" className="cursor-pointer">
                Dry run (simular sin publicar)
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary before publish */}
      {selectedAccount && selectedWarehouse && resolvedTemplate && (
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Cuenta ML:</span>
                <p className="font-medium">{selectedAccountObj?.nickname}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Plantilla:</span>
                <p className="font-medium">{resolvedTemplate.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Almacén:</span>
                <p className="font-medium">{selectedWarehouseObj?.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Modo:</span>
                <p className="font-medium">
                  {dryRun ? "Dry run (simulación)" : "Publicación real"}
                  {limit > 0 ? ` — Límite: ${limit}` : ""}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action button */}
      <div className="flex gap-3">
        <Button
          onClick={runBulkPublish}
          disabled={!canPublish}
          variant={dryRun ? "outline" : "default"}
          size="lg"
        >
          {publishing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {dryRun ? "Simulando..." : "Publicando..."}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              {dryRun ? "Simular publicación" : "Publicar"}
            </>
          )}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <Card className={result.success ? "border-green-200" : "border-red-200"}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              {result.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Resultado {result.summary?.dry_run ? "(simulación)" : ""}
            </CardTitle>
            {result.summary && (
              <CardDescription>
                Plantilla usada: {result.summary.template_name} — Run: {result.summary.run_id}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {result.summary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatBadge label="Candidatos" value={result.summary.total_candidates} />
                <StatBadge
                  label="Publicados"
                  value={result.summary.published}
                  variant="success"
                />
                <StatBadge
                  label="Ya publicados"
                  value={result.summary.already_published}
                  variant="muted"
                />
                <StatBadge
                  label="Sin stock"
                  value={result.summary.skipped_no_stock}
                  variant="muted"
                />
                <StatBadge
                  label="Errores"
                  value={result.summary.errors}
                  variant={result.summary.errors > 0 ? "error" : "muted"}
                />
              </div>
            )}

            {/* Results table */}
            {result.results && result.results.length > 0 && (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">EAN</th>
                      <th className="text-left py-2 px-2">Título</th>
                      <th className="text-left py-2 px-2">Estado</th>
                      <th className="text-left py-2 px-2">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1 px-2 font-mono text-xs">{r.ean || "—"}</td>
                        <td className="py-1 px-2 truncate max-w-[200px]">{r.title || "—"}</td>
                        <td className="py-1 px-2">
                          <Badge
                            variant={
                              r.status === "published"
                                ? "default"
                                : r.status === "error"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="py-1 px-2 text-xs text-muted-foreground">
                          {r.ml_item_id || r.reason || r.error || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.results_truncated && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Mostrando primeros 200 resultados de más.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatBadge({
  label,
  value,
  variant = "default",
}: {
  label: string
  value: number
  variant?: "default" | "success" | "error" | "muted"
}) {
  const colorMap = {
    default: "",
    success: "text-green-600",
    error: "text-red-600",
    muted: "text-muted-foreground",
  }

  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${colorMap[variant]}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
