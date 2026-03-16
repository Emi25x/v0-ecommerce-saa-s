"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Loader2, CheckCircle, AlertCircle, Package, DollarSign, LayoutGrid } from "lucide-react"

type SyncType = "stock" | "price" | "both"

export default function MLSyncPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [priceLists, setPriceLists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedAccountId, setSelectedAccountId] = useState<string>("")
  const [syncType, setSyncType] = useState<SyncType>("stock")
  const [warehouseId, setWarehouseId] = useState<string>("")
  const [priceListId, setPriceListId] = useState<string>("")
  const [zeroMissingStock, setZeroMissingStock] = useState(false)

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const syncStock = syncType === "stock" || syncType === "both"
  const syncPrice = syncType === "price" || syncType === "both"

  useEffect(() => {
    Promise.all([
      fetch("/api/mercadolibre/accounts").then((r) => r.json()),
      fetch("/api/warehouses").then((r) => r.json()),
      fetch("/api/pricing/lists?active_only=1").then((r) => r.json()),
    ])
      .then(([accountsData, warehousesData, priceListsData]) => {
        const accs = Array.isArray(accountsData) ? accountsData : accountsData.accounts || []
        setAccounts(accs)
        if (accs.length > 0) setSelectedAccountId(accs[0].id)

        const whs = warehousesData.warehouses || []
        setWarehouses(whs)
        const defaultWh = whs.find((w: any) => w.is_default)
        if (defaultWh) setWarehouseId(defaultWh.id)

        const lists = priceListsData.lists || []
        setPriceLists(lists)
        if (lists.length > 0) setPriceListId(lists[0].id)
      })
      .catch((err) => {
        console.error("[Sync] Error cargando datos:", err)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSync() {
    if (!selectedAccountId) return
    if (syncPrice && !priceListId) {
      setError("Seleccioná una lista de precios para sincronizar precios.")
      return
    }

    setRunning(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch("/api/ml/sync-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          sync_type: syncType,
          warehouse_id: syncStock && warehouseId ? warehouseId : undefined,
          price_list_id: syncPrice ? priceListId : undefined,
          zero_missing_stock: zeroMissingStock && syncStock,
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error || "Error desconocido")
      } else if (data.rate_limited) {
        setError(data.message || "Rate limit de ML alcanzado.")
        setResult(data)
      } else {
        setResult(data)
      }
    } catch (e: any) {
      setError(e.message || "Error de red")
    } finally {
      setRunning(false)
    }
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sincronización de publicaciones</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Actualiza stock y/o precio en MercadoLibre usando los datos de tu catálogo interno.
        </p>
      </div>

      {/* Tipo de sincronización */}
      <Card className="p-5 space-y-3">
        <p className="text-sm font-medium">¿Qué querés sincronizar?</p>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { value: "stock", label: "Stock", icon: Package },
              { value: "price", label: "Precio", icon: DollarSign },
              { value: "both", label: "Stock + Precio", icon: LayoutGrid },
            ] as { value: SyncType; label: string; icon: any }[]
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setSyncType(value)}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                syncType === value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Cuenta ML */}
      <Card className="p-5 space-y-3">
        <p className="text-sm font-medium">Cuenta de MercadoLibre</p>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cuentas de ML configuradas.</p>
        ) : (
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname || a.ml_user_id}
              </option>
            ))}
          </select>
        )}
        {selectedAccount && (
          <p className="text-xs text-muted-foreground">
            {selectedAccount.total_ml_publications ?? "–"} publicaciones •{" "}
            {selectedAccount.last_stock_sync_at
              ? `Último sync: ${new Date(selectedAccount.last_stock_sync_at).toLocaleString("es-AR")}`
              : "Sin sync previo"}
          </p>
        )}
      </Card>

      {/* Almacén (solo si hay stock) */}
      {syncStock && (
        <Card className="p-5 space-y-3">
          <p className="text-sm font-medium">Almacén de origen</p>
          {warehouses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin almacenes configurados — se usará el stock general de cada producto.
            </p>
          ) : (
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Usar stock general del producto</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} {w.is_default ? "(predeterminado)" : ""}
                </option>
              ))}
            </select>
          )}
        </Card>
      )}

      {/* Lista de precios (solo si hay precio) */}
      {syncPrice && (
        <Card className="p-5 space-y-3">
          <p className="text-sm font-medium">Lista de precios</p>
          {priceLists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay listas de precios activas. Creá una en{" "}
              <a href="/pricing" className="underline">
                Precios
              </a>
              .
            </p>
          ) : (
            <select
              value={priceListId}
              onChange={(e) => setPriceListId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">— Seleccioná una lista —</option>
              {priceLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </Card>
      )}

      {/* Opción: poner stock en 0 */}
      {syncStock && (
        <Card className="p-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded"
              checked={zeroMissingStock}
              onChange={(e) => setZeroMissingStock(e.target.checked)}
            />
            <div>
              <p className="text-sm font-medium">Poner stock en 0 para productos no incluidos</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Las publicaciones que no tengan un producto vinculado en el catálogo pasarán a stock 0 en ML.
              </p>
            </div>
          </label>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Resultado */}
      {result && result.success && (
        <Card className="p-5 space-y-3 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Sincronización completada</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Actualizadas</span>
              <Badge variant="secondary">{result.updated}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sin cambios</span>
              <Badge variant="outline">{result.skipped}</Badge>
            </div>
            {result.zeroed > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Puestas en 0</span>
                <Badge variant="outline">{result.zeroed}</Badge>
              </div>
            )}
            {result.errors > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Errores</span>
                <Badge variant="destructive">{result.errors}</Badge>
              </div>
            )}
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">Total vinculadas</span>
              <Badge variant="outline">{result.total_linked}</Badge>
            </div>
            {result.total_unlinked > 0 && (
              <div className="flex justify-between col-span-2">
                <span className="text-muted-foreground">Sin vincular en ML</span>
                <Badge variant="outline">{result.total_unlinked}</Badge>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Botón */}
      <Button
        onClick={handleSync}
        disabled={running || !selectedAccountId || (syncPrice && !priceListId)}
        className="w-full"
        size="lg"
      >
        {running ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Sincronizando…
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sincronizar
          </>
        )}
      </Button>
    </div>
  )
}
