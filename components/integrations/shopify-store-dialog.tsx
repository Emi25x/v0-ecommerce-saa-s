"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

interface ShopifyStore {
  id: string
  shop_domain: string
  access_token: string
  default_location_id: string | null
  is_active: boolean
}

interface ShopifyStoreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  store?: ShopifyStore | null
}

export function ShopifyStoreDialog({ open, onOpenChange, onSuccess, store }: ShopifyStoreDialogProps) {
  const [shopDomain, setShopDomain] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [defaultLocationId, setDefaultLocationId] = useState("")
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (store) {
      setShopDomain(store.shop_domain)
      setDefaultLocationId(store.default_location_id || "")
      // Don't populate access token for security
      setAccessToken("")
    } else {
      setShopDomain("")
      setAccessToken("")
      setDefaultLocationId("")
    }
    setLocations([])
  }, [store, open])

  const loadLocations = async () => {
    if (!store) return

    setLoadingLocations(true)
    try {
      const response = await fetch(`/api/shopify/stores/${store.id}/locations`)
      const data = await response.json()

      if (response.ok && data.locations) {
        setLocations(data.locations)
      } else {
        toast({
          title: "Error",
          description: "No se pudieron cargar las ubicaciones",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al cargar ubicaciones",
        variant: "destructive",
      })
    } finally {
      setLoadingLocations(false)
    }
  }

  const testConnection = async () => {
    if (!shopDomain || !accessToken) {
      toast({
        title: "Error",
        description: "Ingresa dominio y token de acceso",
        variant: "destructive",
      })
      return
    }

    setTestingConnection(true)
    try {
      const response = await fetch("/api/shopify/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_domain: shopDomain,
          access_token: accessToken,
        }),
      })

      const data = await response.json()

      if (data.connected) {
        toast({
          title: "Conexión exitosa",
          description: data.shop?.name
            ? `Conectado a "${data.shop.name}" (${data.shop.myshopifyDomain})`
            : "Las credenciales son válidas",
        })
      } else {
        toast({
          title: "Error de conexión",
          description: data.error || "No se pudo conectar. Verificá el dominio y el token.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al probar la conexión",
        variant: "destructive",
      })
    } finally {
      setTestingConnection(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!shopDomain || (!accessToken && !store)) {
      toast({
        title: "Error",
        description: "Completa todos los campos requeridos",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const url = store ? `/api/shopify/stores/${store.id}` : "/api/shopify/stores"
      const method = store ? "PUT" : "POST"
      const body: any = {}

      if (!store) {
        body.shop_domain = shopDomain
        body.access_token = accessToken
      } else {
        if (accessToken) body.access_token = accessToken
      }

      if (defaultLocationId) {
        body.default_location_id = defaultLocationId
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to save store")
      }

      toast({
        title: "Éxito",
        description: store ? "Tienda actualizada" : "Tienda agregada correctamente",
      })

      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error al guardar la tienda",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{store ? "Editar" : "Agregar"} Tienda Shopify</DialogTitle>
          <DialogDescription>
            {store
              ? "Actualiza las credenciales de tu tienda"
              : "Conecta una nueva tienda de Shopify"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shop_domain">
              Dominio de la Tienda *
            </Label>
            <Input
              id="shop_domain"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              placeholder="mitienda.myshopify.com"
              disabled={!!store}
              required
            />
            <p className="text-xs text-muted-foreground">
              Ejemplo: mitienda.myshopify.com
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="access_token">
              Access Token {store ? "(dejar vacío para no cambiar)" : "*"}
            </Label>
            <Input
              id="access_token"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              required={!store}
            />
            {!store && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">¿Cómo obtener el Access Token?</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ingresá al panel de tu tienda Shopify</li>
                  <li>Ir a <strong>Configuración → Aplicaciones y canales de ventas</strong></li>
                  <li>Hacer clic en <strong>Desarrollar aplicaciones</strong> (arriba a la derecha)</li>
                  <li>Crear una nueva app con nombre descriptivo (ej: "EcomSaaS")</li>
                  <li>En <strong>Permisos de la API Admin</strong>, activar: <code>read_products</code>, <code>write_products</code>, <code>read_inventory</code>, <code>write_inventory</code></li>
                  <li>Instalar la app y copiar el <strong>Admin API access token</strong> (empieza con <code>shpat_</code>)</li>
                </ol>
                <p className="text-yellow-500 dark:text-yellow-400 mt-1">El token solo se muestra una vez — guardalo antes de cerrar la pantalla de Shopify.</p>
              </div>
            )}
          </div>

          {store && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="location">Ubicación por Defecto</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadLocations}
                  disabled={loadingLocations}
                >
                  {loadingLocations ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cargando...
                    </>
                  ) : (
                    "Cargar Ubicaciones"
                  )}
                </Button>
              </div>

              <Select value={defaultLocationId} onValueChange={setDefaultLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar ubicación" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter className="gap-2">
            {!store && (
              <Button
                type="button"
                variant="outline"
                onClick={testConnection}
                disabled={testingConnection || !shopDomain || !accessToken}
              >
                {testingConnection ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Probando...
                  </>
                ) : (
                  "Probar Conexión"
                )}
              </Button>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
