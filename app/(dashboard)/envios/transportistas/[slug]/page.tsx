"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Truck, Save, TestTube, ArrowLeft, CheckCircle, XCircle, RefreshCw, MapPin } from "lucide-react"

interface FastMailSucursal {
  codigo_sucursal: string
  descripcion: string
  localidad?: string
  provincia?: string
  cp?: number | string
}

interface CabifyHub {
  external_id: string
  name: string
  address?: string
}

interface Carrier {
  id: string
  name: string
  slug: string
  description: string | null
  active: boolean
  config: Record<string, any>
  // credentials NO se exponen desde la API, sólo se escriben
}

export default function CarrierConfigPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [carrier, setCarrier] = useState<Carrier | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saved, setSaved] = useState(false)

  // Campos del formulario
  const [token, setToken] = useState("")
  const [user, setUser] = useState("")
  const [password, setPassword] = useState("")
  const [cabifyClientId, setCabifyClientId] = useState("")
  const [cabifyClientSecret, setCabifyClientSecret] = useState("")
  const [baseUrl, setBaseUrl] = useState("")

  // FastMail: sucursales
  const [sucursales, setSucursales] = useState<FastMailSucursal[]>([])
  const [sucursalesLoading, setSucursalesLoading] = useState(false)
  const [sucursalesError, setSucursalesError] = useState<string | null>(null)
  const [selectedSucursal, setSelectedSucursal] = useState("")

  // Cabify: hubs
  const [cabifyHubs, setCabifyHubs] = useState<CabifyHub[]>([])
  const [cabifyHubsLoading, setCabifyHubsLoading] = useState(false)
  const [cabifyHubsError, setCabifyHubsError] = useState<string | null>(null)
  const [selectedDefaultHub, setSelectedDefaultHub] = useState("")

  const isCabify = slug === "cabify"
  const isFastmail = slug === "fastmail"

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/envios/carriers/${slug}`)
    if (res.ok) {
      const { data } = await res.json()
      setCarrier(data)
      setBaseUrl(data?.config?.base_url ?? "")
      if (slug === "fastmail") {
        setSelectedSucursal(data?.config?.sucursal ?? "")
      }
      if (slug === "cabify") {
        setSelectedDefaultHub(data?.config?.default_hub_external_id ?? "")
      }
    }
    setLoading(false)
  }

  async function loadCabifyHubs() {
    setCabifyHubsLoading(true)
    setCabifyHubsError(null)
    try {
      const res = await fetch("/api/envios/carriers/cabify/hubs")
      const data = await res.json()
      if (!res.ok || data.error) {
        setCabifyHubsError(data.error ?? "Error al cargar hubs")
      } else {
        const hubs = (data.hubs ?? []).map((h: any) => ({
          external_id: h.external_id ?? h.id ?? "",
          name: h.name ?? h.external_id ?? "Sin nombre",
          address: h.address ?? "",
        }))
        setCabifyHubs(hubs)
      }
    } catch (err: any) {
      setCabifyHubsError(err.message)
    }
    setCabifyHubsLoading(false)
  }

  async function loadSucursales() {
    setSucursalesLoading(true)
    setSucursalesError(null)
    const res = await fetch("/api/envios/carriers/fastmail/sucursales")
    const data = await res.json()
    if (!res.ok || data.error) {
      setSucursalesError(data.error ?? "Error al cargar sucursales")
    } else {
      setSucursales(data.sucursales ?? [])
    }
    setSucursalesLoading(false)
  }

  async function save() {
    if (!carrier) return
    setSaving(true)
    setSaved(false)
    const newConfig: any = { ...carrier.config, base_url: baseUrl }
    if (isFastmail && selectedSucursal) {
      newConfig.sucursal = selectedSucursal
    }
    if (isCabify) {
      newConfig.default_hub_external_id = selectedDefaultHub || undefined
      // Guardar también los hubs cargados como caché local
      if (cabifyHubs.length > 0) {
        newConfig.hubs = cabifyHubs.map((h) => ({
          external_id: h.external_id,
          name: h.name,
          address: h.address ?? "",
        }))
      }
    }
    const body: any = {
      config: newConfig,
    }
    if (isCabify) {
      if (cabifyClientId) body.credentials_client_id = cabifyClientId
      if (cabifyClientSecret) body.credentials_client_secret = cabifyClientSecret
    } else if (isFastmail) {
      if (token) body.credentials_token = token
      if (user) body.credentials_user = user
      if (password) body.credentials_password = password
    } else {
      if (user) body.credentials_user = user
      if (password) body.credentials_password = password
    }

    const res = await fetch(`/api/envios/carriers/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setToken("")
      setUser("")
      setPassword("")
      setCabifyClientId("")
      setCabifyClientSecret("")
      load()
      setTimeout(() => setSaved(false), 3000)
    }
  }

  async function test() {
    setTesting(true)
    setTestResult(null)
    const res = await fetch(`/api/envios/carriers/${slug}/test`, { method: "POST" })
    const data = await res.json()
    setTestResult({ ok: res.ok && data.ok, message: data.message ?? (res.ok ? "Conexión OK" : "Error de conexión") })
    setTesting(false)
  }

  useEffect(() => {
    load()
  }, [slug])

  useEffect(() => {
    if (isFastmail && carrier?.active) {
      loadSucursales()
    }
    if (isCabify && carrier?.active) {
      loadCabifyHubs()
    }
  }, [isFastmail, isCabify, carrier?.active])

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>
  if (!carrier) return <div className="p-6 text-sm text-muted-foreground">Transportista no encontrado.</div>

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/envios/transportistas">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          <h1 className="text-2xl font-bold">{carrier.name}</h1>
          <Badge variant={carrier.active ? "default" : "secondary"}>{carrier.active ? "Activo" : "Inactivo"}</Badge>
        </div>
      </div>

      {carrier.description && <p className="text-sm text-muted-foreground">{carrier.description}</p>}

      {/* Configuración de conexión */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuración de API</CardTitle>
          <CardDescription>
            Credenciales para conectar con {carrier.name}. Las contraseñas se guardan encriptadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="base_url">URL base de la API</Label>
            <Input
              id="base_url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://epresislv.fastmail.com.ar"
            />
          </div>
          {isCabify ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cabify_client_id">Client ID (OAUTH_ID)</Label>
                <Input
                  id="cabify_client_id"
                  value={cabifyClientId}
                  onChange={(e) => setCabifyClientId(e.target.value)}
                  placeholder="ej: a9a5f86f-cee1-4682-be5b-c328403e1508"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cabify_client_secret">Client Secret</Label>
                <Input
                  id="cabify_client_secret"
                  type="password"
                  value={cabifyClientSecret}
                  onChange={(e) => setCabifyClientSecret(e.target.value)}
                  placeholder="••••••••••••••••"
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Generá las claves en Cabify Logistics → Configuración → API. La autenticación usa OAuth 2.0 — el
                  Client Secret solo se muestra una vez al generarlo. Dejá en blanco los campos que no querés modificar.
                </p>
              </div>
            </>
          ) : isFastmail ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="api_token">Token API</Label>
                <Input
                  id="api_token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••"
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Generalo en Fast Mail → Configuración → API → Generar claves. Dejá en blanco para no modificarlo.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user">Usuario (opcional)</Label>
                <Input
                  id="user"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="LIBROIDE"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Contraseña (opcional)</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  El token API tiene prioridad. Usuario/contraseña solo se usa como alternativa. Dejá en blanco los
                  campos que no querés modificar.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user">Usuario</Label>
                <Input
                  id="user"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="Usuario de API"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Contraseña / Token</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Dejá en blanco para no modificar la contraseña guardada.
                </p>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving} className="flex-1">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Guardando…" : saved ? "¡Guardado!" : "Guardar"}
            </Button>
            <Button variant="outline" onClick={test} disabled={testing}>
              <TestTube className="mr-2 h-4 w-4" />
              {testing ? "Probando…" : "Probar conexión"}
            </Button>
          </div>

          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${testResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
            >
              {testResult.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
              {testResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sucursales FastMail */}
      {isFastmail && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Sucursales del cliente
                </CardTitle>
                <CardDescription>
                  Seleccioná la sucursal activa. Se usa en cotizaciones y generación de guías.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadSucursales} disabled={sucursalesLoading}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${sucursalesLoading ? "animate-spin" : ""}`} />
                {sucursalesLoading ? "Cargando…" : "Actualizar"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {sucursalesError && <p className="text-sm text-red-600 mb-3">{sucursalesError}</p>}
            {!sucursalesLoading && sucursales.length === 0 && !sucursalesError && (
              <p className="text-sm text-muted-foreground">
                No se encontraron sucursales. Verificá que el token API sea correcto y hacé clic en Actualizar.
              </p>
            )}
            {sucursales.length > 0 && (
              <div className="flex flex-col gap-2">
                {sucursales.map((s) => (
                  <label
                    key={s.codigo_sucursal}
                    className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                      selectedSucursal === s.codigo_sucursal
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="sucursal"
                      value={s.codigo_sucursal}
                      checked={selectedSucursal === s.codigo_sucursal}
                      onChange={() => setSelectedSucursal(s.codigo_sucursal)}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-medium text-sm">{s.descripcion}</span>
                      <span className="text-xs text-muted-foreground font-mono">{s.codigo_sucursal}</span>
                      {(s.localidad || s.provincia) && (
                        <span className="text-xs text-muted-foreground">
                          {[s.localidad, s.provincia, s.cp].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </div>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground mt-1">
                  Hacé clic en <strong>Guardar</strong> (arriba) para aplicar la sucursal seleccionada.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Hubs Cabify */}
      {isCabify && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Hubs (depósitos)
                </CardTitle>
                <CardDescription>
                  Seleccioná el hub por defecto para pickup. Se usa como punto de retiro en los envíos.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadCabifyHubs} disabled={cabifyHubsLoading}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${cabifyHubsLoading ? "animate-spin" : ""}`} />
                {cabifyHubsLoading ? "Cargando…" : "Sincronizar"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {cabifyHubsError && <p className="text-sm text-red-600 mb-3">{cabifyHubsError}</p>}
            {!cabifyHubsLoading && cabifyHubs.length === 0 && !cabifyHubsError && (
              <p className="text-sm text-muted-foreground">
                No se encontraron hubs. Verificá que las credenciales sean correctas y que tengas hubs creados en Cabify Logistics.
              </p>
            )}
            {cabifyHubs.length > 0 && (
              <div className="flex flex-col gap-2">
                {cabifyHubs.map((h) => (
                  <label
                    key={h.external_id}
                    className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                      selectedDefaultHub === h.external_id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="cabify_hub"
                      value={h.external_id}
                      checked={selectedDefaultHub === h.external_id}
                      onChange={() => setSelectedDefaultHub(h.external_id)}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-medium text-sm">{h.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{h.external_id}</span>
                      {h.address && (
                        <span className="text-xs text-muted-foreground">{h.address}</span>
                      )}
                    </div>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground mt-1">
                  Hacé clic en <strong>Guardar</strong> (arriba) para aplicar el hub seleccionado como default.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Info técnica */}
      {carrier.config && Object.keys(carrier.config).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalles técnicos</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {Object.entries(carrier.config).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                  <dd className="font-mono text-xs">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
