"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, Trash2, Star, Calculator, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface PriceProfile {
  id: string
  name: string
  description: string | null
  margin_percent: number
  listing_type_id: string
  is_default: boolean
  created_at: string
}

interface ExchangeRate {
  rate: number
  source: string
  updated_at: string
}

interface PriceCalculation {
  cost_eur: number
  cost_ars: number
  ml_commission: number
  ml_fixed_fee: number
  shipping_cost: number
  margin_amount: number
  final_price: number
  margin_percent: number
}

export default function PricingPage() {
  const { toast } = useToast()
  const [profiles, setProfiles] = useState<PriceProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null)
  
  // Nuevo perfil
  const [newProfile, setNewProfile] = useState({
    name: "",
    description: "",
    margin_percent: 20,
    listing_type_id: "gold_special"
  })
  const [showNewForm, setShowNewForm] = useState(false)
  
  // Calculadora de prueba
  const [testCostEur, setTestCostEur] = useState<number>(10)
  const [testProfileId, setTestProfileId] = useState<string>("")
  const [calculation, setCalculation] = useState<PriceCalculation | null>(null)
  const [calculating, setCalculating] = useState(false)

  useEffect(() => {
    fetchProfiles()
    fetchExchangeRate()
  }, [])

  const fetchProfiles = async () => {
    try {
      const response = await fetch("/api/pricing/profiles")
      const data = await response.json()
      setProfiles(data.profiles || [])
      // Seleccionar perfil por defecto para la calculadora
      const defaultProfile = data.profiles?.find((p: PriceProfile) => p.is_default)
      if (defaultProfile) {
        setTestProfileId(defaultProfile.id)
      }
    } catch (error) {
      console.error("Error fetching profiles:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchExchangeRate = async () => {
    try {
      const response = await fetch("/api/exchange-rate")
      const data = await response.json()
      setExchangeRate(data)
    } catch (error) {
      console.error("Error fetching exchange rate:", error)
    }
  }

  const createProfile = async () => {
    if (!newProfile.name.trim()) {
      toast({ title: "Error", description: "El nombre es requerido", variant: "destructive" })
      return
    }
    
    setSaving(true)
    try {
      const response = await fetch("/api/pricing/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProfile)
      })
      
      if (response.ok) {
        toast({ title: "Perfil creado", description: `${newProfile.name} guardado correctamente` })
        setNewProfile({ name: "", description: "", margin_percent: 20, listing_type_id: "gold_special" })
        setShowNewForm(false)
        fetchProfiles()
      } else {
        const data = await response.json()
        toast({ title: "Error", description: data.error, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "No se pudo crear el perfil", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const deleteProfile = async (id: string) => {
    try {
      const response = await fetch(`/api/pricing/profiles/${id}`, { method: "DELETE" })
      if (response.ok) {
        toast({ title: "Perfil eliminado" })
        fetchProfiles()
      }
    } catch (error) {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" })
    }
  }

  const setAsDefault = async (id: string) => {
    try {
      const response = await fetch(`/api/pricing/profiles/${id}/default`, { method: "PUT" })
      if (response.ok) {
        toast({ title: "Perfil marcado como predeterminado" })
        fetchProfiles()
      }
    } catch (error) {
      toast({ title: "Error", description: "No se pudo actualizar", variant: "destructive" })
    }
  }

  const calculatePrice = async () => {
    if (!testProfileId || testCostEur <= 0) return
    
    const profile = profiles.find(p => p.id === testProfileId)
    if (!profile) return
    
    setCalculating(true)
    try {
      const response = await fetch("/api/ml/calculate-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cost_eur: testCostEur,
          margin_percent: profile.margin_percent,
          listing_type_id: profile.listing_type_id
        })
      })
      
      const data = await response.json()
      if (response.ok) {
        setCalculation(data)
      }
    } catch (error) {
      console.error("Error calculating price:", error)
    } finally {
      setCalculating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Calculadora de Precios</h1>
          <p className="text-muted-foreground">
            Configura perfiles de precios para usar en publicaciones masivas
          </p>
        </div>
        {exchangeRate && (
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Tipo de cambio EUR/ARS</p>
            <p className="text-2xl font-bold">${exchangeRate.rate.toLocaleString("es-AR")}</p>
            <p className="text-xs text-muted-foreground">{exchangeRate.source}</p>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Perfiles de precios */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Perfiles de Precios</CardTitle>
                <CardDescription>Configuraciones guardadas para aplicar en publicaciones</CardDescription>
              </div>
              <Button onClick={() => setShowNewForm(!showNewForm)} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Formulario nuevo perfil */}
            {showNewForm && (
              <div className="p-4 border rounded-lg space-y-4 bg-muted/50">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input
                      value={newProfile.name}
                      onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                      placeholder="Ej: Margen alto 30%"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Margen %</Label>
                    <Input
                      type="number"
                      value={newProfile.margin_percent}
                      onChange={(e) => setNewProfile({ ...newProfile, margin_percent: parseFloat(e.target.value) || 0 })}
                      min={0}
                      max={100}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descripción (opcional)</Label>
                  <Input
                    value={newProfile.description}
                    onChange={(e) => setNewProfile({ ...newProfile, description: e.target.value })}
                    placeholder="Descripción del perfil"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de publicación</Label>
                  <Select
                    value={newProfile.listing_type_id}
                    onValueChange={(v) => setNewProfile({ ...newProfile, listing_type_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gold_special">Gold Special (Clásica)</SelectItem>
                      <SelectItem value="gold_pro">Gold Pro (Premium)</SelectItem>
                      <SelectItem value="free">Gratuita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={createProfile} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Guardar
                  </Button>
                  <Button variant="outline" onClick={() => setShowNewForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Lista de perfiles */}
            <div className="space-y-2">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{profile.name}</span>
                      {profile.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Predeterminado
                        </Badge>
                      )}
                    </div>
                    {profile.description && (
                      <p className="text-sm text-muted-foreground">{profile.description}</p>
                    )}
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>Margen: {profile.margin_percent}%</span>
                      <span>Tipo: {profile.listing_type_id}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!profile.is_default && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAsDefault(profile.id)}
                          title="Marcar como predeterminado"
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteProfile(profile.id)}
                          className="text-destructive hover:text-destructive"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              
              {profiles.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No hay perfiles creados. Crea uno para comenzar.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Calculadora de prueba */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Probar Cálculo
            </CardTitle>
            <CardDescription>
              Simula el precio final de un producto usando un perfil
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Costo en EUR</Label>
                <Input
                  type="number"
                  value={testCostEur}
                  onChange={(e) => setTestCostEur(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.01}
                />
              </div>
              <div className="space-y-2">
                <Label>Perfil de precios</Label>
                <Select value={testProfileId} onValueChange={setTestProfileId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.margin_percent}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={calculatePrice} disabled={calculating || !testProfileId} className="w-full">
              {calculating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Calcular Precio
            </Button>

            {calculation && (
              <div className="p-4 border rounded-lg space-y-3 bg-muted/30">
                <h4 className="font-medium">Desglose del precio</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Costo EUR:</span>
                    <span>€{calculation.cost_eur.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Costo ARS:</span>
                    <span>${calculation.cost_ars.toLocaleString("es-AR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Comisión ML ({profiles.find(p => p.id === testProfileId)?.listing_type_id}):</span>
                    <span>${calculation.ml_commission.toLocaleString("es-AR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cargo fijo ML:</span>
                    <span>${calculation.ml_fixed_fee.toLocaleString("es-AR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Envío gratis:</span>
                    <span>${calculation.shipping_cost.toLocaleString("es-AR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Margen ({calculation.margin_percent}%):</span>
                    <span>${calculation.margin_amount.toLocaleString("es-AR")}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t text-lg font-bold">
                    <span>Precio Final:</span>
                    <span className="text-primary">${calculation.final_price.toLocaleString("es-AR")}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
