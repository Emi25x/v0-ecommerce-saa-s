"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Truck, Save, TestTube, ArrowLeft, CheckCircle, XCircle } from "lucide-react"

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
  const slug   = params?.slug as string

  const [carrier, setCarrier]         = useState<Carrier | null>(null)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [testing, setTesting]         = useState(false)
  const [testResult, setTestResult]   = useState<{ ok: boolean; message: string } | null>(null)
  const [saved, setSaved]             = useState(false)

  // Campos del formulario
  const [user, setUser]               = useState("")
  const [password, setPassword]       = useState("")
  const [baseUrl, setBaseUrl]         = useState("")

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/envios/carriers/${slug}`)
    if (res.ok) {
      const { data } = await res.json()
      setCarrier(data)
      setBaseUrl(data?.config?.base_url ?? "")
    }
    setLoading(false)
  }

  async function save() {
    if (!carrier) return
    setSaving(true)
    setSaved(false)
    const body: any = {
      config: { ...carrier.config, base_url: baseUrl },
    }
    if (user)     body.credentials_user     = user
    if (password) body.credentials_password = password

    const res = await fetch(`/api/envios/carriers/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setUser("")
      setPassword("")
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

  useEffect(() => { load() }, [slug])

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>
  if (!carrier) return <div className="p-6 text-sm text-muted-foreground">Transportista no encontrado.</div>

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/envios/transportistas"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          <h1 className="text-2xl font-bold">{carrier.name}</h1>
          <Badge variant={carrier.active ? "default" : "secondary"}>
            {carrier.active ? "Activo" : "Inactivo"}
          </Badge>
        </div>
      </div>

      {carrier.description && (
        <p className="text-sm text-muted-foreground">{carrier.description}</p>
      )}

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
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://epresislv.fastmail.com.ar"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user">Usuario</Label>
            <Input
              id="user"
              value={user}
              onChange={e => setUser(e.target.value)}
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
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Dejá en blanco para no modificar la contraseña guardada.
            </p>
          </div>

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
            <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${testResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {testResult.ok
                ? <CheckCircle className="h-4 w-4 shrink-0" />
                : <XCircle className="h-4 w-4 shrink-0" />
              }
              {testResult.message}
            </div>
          )}
        </CardContent>
      </Card>

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
