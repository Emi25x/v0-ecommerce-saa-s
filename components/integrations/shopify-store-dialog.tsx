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

type AuthMode = "token" | "apikey"

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
  const [storeName, setStoreName] = useState("")
  const [shopDomain, setShopDomain] = useState("")
  const [authMode, setAuthMode] = useState<AuthMode>("token")
  const [accessToken, setAccessToken] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [defaultLocationId, setDefaultLocationId] = useState("")
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (store) {
      setStoreName((store as any).name || "")
      setShopDomain(store.shop_domain)
      setDefaultLocationId(store.default_location_id || "")
      setAccessToken("")
      setApiKey("")
      setApiSecret("")
    } else {
      setStoreName("")
      setShopDomain("")
      setAccessToken("")
      setApiKey("")
      setApiSecret("")
      setDefaultLocationId("")
      setAuthMode("token")
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
    const hasToken = authMode === "token" && accessToken
    const hasApiKey = authMode === "apikey" && apiKey && apiSecret
    if (!shopDomain || (!hasToken && !hasApiKey)) {
      toast({
        title: "Error",
        description: authMode === "token"
          ? "Ingresá el dominio y el access token"
          : "Ingresá el dominio, la clave API y el secreto",
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
          ...(authMode === "token" ? { access_token: accessToken } : { api_key: apiKey, api_secret: apiSecret }),
        }),
      })

      const data = await response.json()

      if (data.connected) {
        // Si el servidor hizo el exchange OAuth, guardar el shpat_ obtenido
        // para que al hacer "Guardar" no sea necesario intercambiar de nuevo
        if (data.access_token && authMode === "apikey") {
          setAccessToken(data.access_token)
          setAuthMode("token") // cambia al modo token con el shpat_ ya listo
        }
        toast({
          title: "Conexión exitosa",
          description: data.shop?.name
            ? `Conectado a "${data.shop.name}" (${data.shop.myshopifyDomain ?? shopDomain})`
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

    if (!shopDomain || (!accessToken && !store && authMode === "token")) {
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

      if (storeName) body.name = storeName

      if (!store) {
        body.shop_domain = shopDomain
        if (authMode === "token") {
          body.access_token = accessToken
        } else {
          body.api_key = apiKey
          body.api_secret = apiSecret
        }
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
            <Label htmlFor="store_name">
              Nombre de la Conexión
            </Label>
            <Input
              id="store_name"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Ej: Tienda Principal, Mayorista, etc."
            />
            <p className="text-xs text-muted-foreground">
              Nombre para identificar esta conexión (opcional)
            </p>
          </div>

          {!store && (
            <div className="space-y-2">
              <Label>Método de autenticación</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={authMode === "token" ? "default" : "outline"}
                  onClick={() => setAuthMode("token")}
                >
                  Access Token
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={authMode === "apikey" ? "default" : "outline"}
                  onClick={() => setAuthMode("apikey")}
                >
                  Clave API + Secreto
                </Button>
              </div>
            </div>
          )}

          {(!store || store) && authMode === "token" && (
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
              <p className="text-xs text-muted-foreground">
                Empieza con <code>shpat_</code> — se obtiene desde Shopify → Configuración → Aplicaciones → Desarrollar aplicaciones → instalar app
              </p>
            </div>
          )}

          {!store && authMode === "apikey" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="api_key">ID de cliente (Client ID) *</Label>
                <Input
                  id="api_key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="ff6e9519b99bd07a9dc17527cd48e329"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api_secret">Secreto (Client Secret) *</Label>
                <Input
                  id="api_secret"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="shpss_..."
                  required
                />
              </div>
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2.5 space-y-1">
                <p className="text-xs font-medium text-blue-800 dark:text-blue-300">
                  Requisito: La app debe estar INSTALADA
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  En Shopify → Configuración → Aplicaciones → Desarrollar apps → tu app →
                  hacé click en <strong>&quot;Instalar&quot;</strong>. Después volvé acá y probá la conexión.
                </p>
              </div>
            </div>
          )}

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
                disabled={
                  testingConnection ||
                  !shopDomain ||
                  (authMode === "token" && !accessToken) ||
                  (authMode === "apikey" && (!apiKey || !apiSecret))
                }
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
