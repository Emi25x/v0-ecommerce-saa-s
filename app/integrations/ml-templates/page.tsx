"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface MLAccount {
  id: string
  nickname: string
  ml_user_id: string
}

interface Template {
  id: string
  account_id: string
  name: string
  description?: string
  title_template?: string
  listing_type_id: string
  condition: string
  currency_id: string
  price_formula?: string
  shipping_mode: string
  free_shipping: boolean
  local_pick_up: boolean
  warranty?: string
  description_template?: string
  fixed_attributes: any[]
  attribute_mapping: Record<string, string>
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

interface AnalysisResult {
  ml_item: any
  catalog_product: any
  ean_found: string
  suggested_template: any
}

interface RangeAnalysis {
  below33k: {
    avgMultiplier: number
    avgMargin: number
    count: number
  }
  above33k: {
    avgMultiplier: number
    avgMargin: number
    count: number
  }
  recommendation: "below" | "above" | "mixed"
  details: {
    costEur: number
    finalPrice: number
    multiplier: number
    margin: number
    zone: "below" | "above"
  }[]
}

interface PriceProfile {
  id: string
  name: string
  description?: string
  margin_percent: number
  listing_type_id: string
  is_default: boolean
}

export default function MLTemplatesPage() {
  const [accounts, setAccounts] = useState<MLAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Estado para análisis
  const [itemIdToAnalyze, setItemIdToAnalyze] = useState("")
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  
  // Estado para edición de plantilla
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  
  // Estado para calculadora de precios
  const [marginPercent, setMarginPercent] = useState(20)
  const [testCostEur, setTestCostEur] = useState(10)
  const [calculating, setCalculating] = useState(false)
  
  // Estado para perfiles de precios
  const [priceProfiles, setPriceProfiles] = useState<PriceProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string>("")
  const [newProfileName, setNewProfileName] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)
  const [priceCalculation, setPriceCalculation] = useState<{
    cost_price_eur: number
    exchange_rate: number
    cost_in_ars: number
    margin_percent: number
    ml_fee_percent: number
    ml_fixed_fee: number
    shipping_cost: number
    final_price_ars: number
    verification: {
      ml_commission: number
      shipping_cost: number
      total_costs: number
      net_received: number
      actual_margin_percent: number
      profit_ars: number
    }
  } | null>(null)
  
  // Estado para analisis de umbral $33k
  const [thresholdCostEur, setThresholdCostEur] = useState(15)
  const [marginMin, setMarginMin] = useState(20)
  const [marginMax, setMarginMax] = useState(25)
  const [calculatingThreshold, setCalculatingThreshold] = useState(false)
  const [thresholdAnalysis, setThresholdAnalysis] = useState<{
    costEur: number
    costArs: number
    exchangeRate: number
    below33k: {
      price: number
      margin: number
      multiplier: number
      fixedFee: number
      shippingCost: number
      netProfit: number
      withinRange: boolean
    }
    above33k: {
      price: number
      margin: number
      multiplier: number
      fixedFee: number
      shippingCost: number
      netProfit: number
      withinRange: boolean
    }
    recommendation: "below" | "above" | "either"
    reason: string
  } | null>(null)
  
  // Campos de la plantilla
  const [templateForm, setTemplateForm] = useState({
    name: "Plantilla Principal",
    description: "",
    title_template: "{title}",
    listing_type_id: "gold_special",
    condition: "new",
    currency_id: "ARS",
    price_formula: "price * 1.0",
    shipping_mode: "me2",
    free_shipping: false,
    local_pick_up: false,
    warranty: "30 días de garantía",
    description_template: "",
    is_default: true,
    handling_days: 3,
    price_profile_id: "",
    attribute_mapping: {} as Record<string, string>,
  })

  useEffect(() => {
    fetchAccounts()
    fetchPriceProfiles(setPriceProfiles) // Use fetchPriceProfiles
  }, [])

  useEffect(() => {
    if (selectedAccount) {
      fetchTemplates()
    }
  }, [selectedAccount])

  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/mercadolibre/accounts")
      const data = await response.json()
      if (data.accounts) {
        setAccounts(data.accounts)
        if (data.accounts.length > 0) {
          setSelectedAccount(data.accounts[0].id)
        }
      }
    } catch (error) {
      console.error("Error fetching accounts:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const response = await fetch(`/api/ml/templates?account_id=${selectedAccount}`)
      const data = await response.json()
      if (data.templates) {
        setTemplates(data.templates)
      }
    } catch (error) {
      console.error("Error fetching templates:", error)
    }
  }

  const analyzeItem = async () => {
    if (!itemIdToAnalyze || !selectedAccount) {
      toast({ title: "Error", description: "Ingresa un ID de publicación", variant: "destructive" })
      return
    }

    setAnalyzing(true)
    setAnalysisResult(null)

    try {
      const response = await fetch("/api/ml/templates/analyze-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemIdToAnalyze, account_id: selectedAccount }),
      })

      const data = await response.json()

      if (data.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" })
        return
      }

      setAnalysisResult(data)
      
      // Pre-llenar el formulario con la plantilla sugerida
      if (data.suggested_template) {
        setTemplateForm({
          ...templateForm,
          ...data.suggested_template,
          name: `Plantilla basada en ${data.ml_item.title?.substring(0, 30)}...`,
        })
      }

      toast({ title: "Analisis completado", description: `EAN encontrado: ${data.ean_found || "No encontrado"}` })
    } catch (error) {
      console.error("Error analyzing item:", error)
      toast({ title: "Error", description: "Error al analizar la publicacion", variant: "destructive" })
    } finally {
      setAnalyzing(false)
    }
  }

  const saveTemplate = async () => {
    if (!selectedAccount) return

    setSaving(true)
    try {
      const method = editingTemplate ? "PUT" : "POST"
      const body = editingTemplate 
        ? { id: editingTemplate.id, ...templateForm }
        : { account_id: selectedAccount, ...templateForm }

      const response = await fetch("/api/ml/templates", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (data.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" })
        return
      }

      toast({ title: "Exito", description: "Plantilla guardada correctamente" })
      fetchTemplates()
      setShowEditor(false)
      setEditingTemplate(null)
    } catch (error) {
      console.error("Error saving template:", error)
      toast({ title: "Error", description: "Error al guardar la plantilla", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta plantilla?")) return

    try {
      const response = await fetch(`/api/ml/templates?id=${id}`, { method: "DELETE" })
      const data = await response.json()

      if (data.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" })
        return
      }

      toast({ title: "Exito", description: "Plantilla eliminada" })
      fetchTemplates()
    } catch (error) {
      console.error("Error deleting template:", error)
    }
  }

  const fetchPriceProfiles = async () => {
    try {
      const response = await fetch("/api/price-profiles")
      const data = await response.json()
      if (data.profiles) {
        setPriceProfiles(data.profiles)
        // Seleccionar el perfil por defecto
        const defaultProfile = data.profiles.find((p: PriceProfile) => p.is_default)
        if (defaultProfile) {
          setSelectedProfileId(defaultProfile.id)
          setMarginPercent(Number(defaultProfile.margin_percent))
        }
      }
    } catch (error) {
      console.error("Error fetching price profiles:", error)
    }
  }

  const saveProfile = async () => {
    if (!newProfileName.trim()) {
      toast({ title: "Error", description: "Ingresa un nombre para el perfil", variant: "destructive" })
      return
    }
    
    setSavingProfile(true)
    try {
      const response = await fetch("/api/price-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProfileName,
          margin_percent: marginPercent,
          listing_type_id: "gold_special"
        })
      })
      
      const data = await response.json()
      if (data.profile) {
        toast({ title: "Perfil guardado", description: `Perfil "${newProfileName}" creado` })
        setNewProfileName("")
        fetchPriceProfiles()
      } else {
        toast({ title: "Error", description: data.error || "Error al guardar", variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al guardar perfil", variant: "destructive" })
    } finally {
      setSavingProfile(false)
    }
  }

  const deleteProfile = async (id: string) => {
    if (!confirm("¿Eliminar este perfil de precios?")) return
    
    try {
      const response = await fetch(`/api/price-profiles?id=${id}`, { method: "DELETE" })
      const data = await response.json()
      if (data.success) {
        toast({ title: "Perfil eliminado" })
        fetchPriceProfiles()
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al eliminar", variant: "destructive" })
    }
  }

  const loadProfile = (profile: PriceProfile) => {
    // Actualizar calculadora
    setSelectedProfileId(profile.id)
    setMarginPercent(Number(profile.margin_percent))
    
    // Actualizar plantilla: vincular perfil y actualizar fórmula
    setTemplateForm({
      ...templateForm,
      price_profile_id: profile.id,
      price_formula: `margin:${profile.margin_percent}%`
    })
    
    toast({ title: "Perfil cargado", description: `Vinculado "${profile.name}" (${profile.margin_percent}%) a la plantilla` })
  }

  const calculatePrice = async () => {
    setCalculating(true)
    try {
      const response = await fetch("/api/ml/calculate-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cost_price_eur: testCostEur,
          margin_percent: marginPercent,
          listing_type_id: "gold_special"
        })
      })
      
      const data = await response.json()
      if (data.success) {
        setPriceCalculation(data.calculation)
      } else {
        toast({ title: "Error", description: data.error || "Error al calcular", variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al calcular precio", variant: "destructive" })
    } finally {
      setCalculating(false)
    }
  }
  
  const applyMarginToTemplate = async () => {
    if (!priceCalculation) {
      toast({ title: "Error", description: "Primero debes calcular el precio", variant: "destructive" })
      return
    }
    
    if (templates.length === 0) {
      toast({ title: "Error", description: "No hay plantillas disponibles", variant: "destructive" })
      return
    }
    
    // Usar la primera plantilla o la que este siendo editada
    const targetTemplate = editingTemplate || templates[0]
    
    try {
      const response = await fetch("/api/ml/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetTemplate.id,
          price_formula: `margin:${marginPercent}%`,
          margin_percent: marginPercent
        })
      })
      
      const data = await response.json()
      
      if (data.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" })
        return
      }
      
      toast({ 
        title: "Margen aplicado", 
        description: `Plantilla "${targetTemplate.name}" actualizada con ${marginPercent}% de margen` 
      })
      
      fetchTemplates()
    } catch (error) {
      toast({ title: "Error", description: "Error al actualizar plantilla", variant: "destructive" })
    }
  }
  
  const analyzeThreshold = async () => {
    setCalculatingThreshold(true)
    try {
      // Obtener tipo de cambio actual
      const rateResponse = await fetch("https://dolarapi.com/v1/cotizaciones/eur")
      const rateData = await rateResponse.json()
      const exchangeRate = Math.round((rateData.venta || 1718) * 1.027) // EUR billetes BNA
      
      const costArs = thresholdCostEur * exchangeRate
      
      // Calcular para precio DEBAJO de $33k (con cargo fijo, sin envio)
      // Encontrar el margen que da precio cercano a $32,999
      const targetPriceBelow = 32999
      const mlFeePercent = 0.13
      
      // Para debajo de $33k, determinar cargo fijo segun rango estimado
      let fixedFeeBelow = 2810 // Asumimos rango $25k-$33k
      if (costArs * 1.2 < 15000) fixedFeeBelow = 1115
      else if (costArs * 1.2 < 25000) fixedFeeBelow = 2300
      
      // Calcular margen resultante si fijamos precio en $32,999
      const netReceivedBelow = targetPriceBelow - (targetPriceBelow * mlFeePercent) - fixedFeeBelow
      const marginBelow = ((netReceivedBelow - costArs) / costArs) * 100
      const profitBelow = netReceivedBelow - costArs
      
      // Calcular para precio ARRIBA de $33k (sin cargo fijo, con envio gratis)
      const shippingCost = 5500
      
      // Calcular precio minimo arriba de $33k con margen minimo aceptable
      const targetMarginAbove = marginMin / 100
      const costWithMarginAbove = costArs * (1 + targetMarginAbove)
      const priceAbove = Math.ceil((costWithMarginAbove + shippingCost) / (1 - mlFeePercent) / 10) * 10
      
      // Verificar que quede arriba de $33k
      const finalPriceAbove = Math.max(priceAbove, 33100)
      const netReceivedAbove = finalPriceAbove - (finalPriceAbove * mlFeePercent) - shippingCost
      const marginAbove = ((netReceivedAbove - costArs) / costArs) * 100
      const profitAbove = netReceivedAbove - costArs
      
      // Determinar recomendacion
      const belowWithinRange = marginBelow >= marginMin && marginBelow <= marginMax
      const aboveWithinRange = marginAbove >= marginMin && marginAbove <= marginMax
      
      let recommendation: "below" | "above" | "either" = "either"
      let reason = ""
      
      if (!belowWithinRange && !aboveWithinRange) {
        recommendation = marginBelow > marginAbove ? "below" : "above"
        reason = "Ninguna opcion esta dentro del rango de margen deseado"
      } else if (belowWithinRange && !aboveWithinRange) {
        recommendation = "below"
        reason = "Solo debajo de $33k cumple el rango de margen"
      } else if (!belowWithinRange && aboveWithinRange) {
        recommendation = "above"
        reason = "Solo arriba de $33k cumple el rango de margen. Ademas con envio gratis se vende mas."
      } else {
        // Ambos dentro del rango - recomendar arriba por envio gratis
        recommendation = "above"
        reason = "Ambas opciones cumplen el margen, pero con envio gratis se vende mas."
      }
      
      setThresholdAnalysis({
        costEur: thresholdCostEur,
        costArs,
        exchangeRate,
        below33k: {
          price: targetPriceBelow,
          margin: Math.round(marginBelow * 10) / 10,
          multiplier: Math.round(targetPriceBelow / thresholdCostEur),
          fixedFee: fixedFeeBelow,
          shippingCost: 0,
          netProfit: Math.round(profitBelow),
          withinRange: belowWithinRange
        },
        above33k: {
          price: finalPriceAbove,
          margin: Math.round(marginAbove * 10) / 10,
          multiplier: Math.round(finalPriceAbove / thresholdCostEur),
          fixedFee: 0,
          shippingCost,
          netProfit: Math.round(profitAbove),
          withinRange: aboveWithinRange
        },
        recommendation,
        reason
      })
    } catch (error) {
      toast({ title: "Error", description: "Error al analizar umbral", variant: "destructive" })
    } finally {
      setCalculatingThreshold(false)
    }
  }

  const editTemplate = (template: any) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      description: template.description || "",
      title_template: template.title_template || "{title}",
      listing_type_id: template.listing_type_id,
      condition: template.condition,
      currency_id: template.currency_id,
      price_formula: template.price_formula || "price * 1.0",
      shipping_mode: template.shipping_mode,
      free_shipping: template.free_shipping,
      local_pick_up: template.local_pick_up,
      warranty: template.warranty || "",
      description_template: template.description_template || "",
      is_default: template.is_default,
      handling_days: template.handling_days || 3,
      price_profile_id: template.price_profile_id || "",
      attribute_mapping: template.attribute_mapping || {},
    })
    setShowEditor(true)
  }

  const newTemplate = () => {
    setEditingTemplate(null)
    // Obtener el perfil por defecto
    const defaultProfile = priceProfiles.find(p => p.is_default)
    setTemplateForm({
      name: "Nueva Plantilla",
      description: "",
      title_template: "{title}",
      listing_type_id: "gold_special",
      condition: "new",
      currency_id: "ARS",
      price_formula: "price * 1.0",
      shipping_mode: "me2",
      free_shipping: false,
      local_pick_up: false,
      warranty: "30 días de garantía",
      is_default: false,
      handling_days: 3,
      price_profile_id: defaultProfile?.id || "",
      attribute_mapping: {},
    })
    setShowEditor(true)
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Cargando...</div>
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" />
            </svg>
            <h1 className="text-xl font-semibold">Plantillas de Publicacion ML</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Plantillas de Publicacion</h2>
            <p className="text-muted-foreground">
              Configura plantillas para automatizar la publicacion de productos en Mercado Libre
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Seleccionar cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={newTemplate}>Nueva Plantilla</Button>
            <Button 
              variant="outline"
              onClick={async () => {
                try {
                  toast({ title: "Analizando publicaciones de ML...", description: "Esto puede tomar unos segundos" })
                  const res = await fetch("/api/ml/templates/generate-from-account", { method: "POST" })
                  const data = await res.json()
                  if (res.ok) {
                    toast({ 
                      title: "Plantilla generada", 
                      description: `Se analizaron ${data.analysis?.matches_found || 0} publicaciones` 
                    })
                    fetchTemplates()
                  } else {
                    toast({ 
                      title: "Error", 
                      description: data.error || "No se pudo generar la plantilla",
                      variant: "destructive"
                    })
                  }
                } catch {
                  toast({ title: "Error", description: "Error al generar plantilla", variant: "destructive" })
                }
              }}
            >
              Generar desde ML
            </Button>
          </div>
        </div>

        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList>
            <TabsTrigger value="templates">Plantillas</TabsTrigger>
            <TabsTrigger value="calculator">Calculadora de Precios</TabsTrigger>
            <TabsTrigger value="analyze">Analizar Publicacion</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-4">
            {templates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="mb-4 text-muted-foreground">No hay plantillas configuradas</p>
                  <Button onClick={newTemplate}>Crear primera plantilla</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {templates.map((template) => (
                  <Card key={template.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {template.name}
                            {template.is_default && <Badge>Principal</Badge>}
                          </CardTitle>
                          <CardDescription>{template.description || "Sin descripcion"}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Tipo:</span>{" "}
                          {template.listing_type_id === "gold_special" ? "Premium" : template.listing_type_id}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Condicion:</span>{" "}
                          {template.condition === "new" ? "Nuevo" : template.condition}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Envio:</span>{" "}
                          {template.shipping_mode}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Envio gratis:</span>{" "}
                          {template.free_shipping ? "Si" : "No"}
                        </div>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Formula de precio:</span>{" "}
                        <code className="rounded bg-muted px-1">{template.price_formula}</code>
                        {template.price_profile_id && (() => {
                          const linkedProfile = priceProfiles.find(p => p.id === template.price_profile_id)
                          return linkedProfile ? (
                            <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                              (vinculado a "{linkedProfile.name}" {linkedProfile.margin_percent}%)
                            </span>
                          ) : null
                        })()}
                      </div>
                      {template.description_template && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Plantilla de descripcion:</span>
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
                            {template.description_template.substring(0, 200)}
                            {template.description_template.length > 200 ? "..." : ""}
                          </pre>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => editTemplate(template)}>
                          Editar
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteTemplate(template.id)}>
                          Eliminar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="calculator" className="space-y-6">
            {/* Seccion 1: Calculo por Margen Exacto */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Calculo por Margen Exacto</h2>
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Panel de configuracion */}
                <Card>
                  <CardHeader>
                    <CardTitle>Configurar Margen</CardTitle>
                    <CardDescription>
                      Define el margen de ganancia deseado y el sistema calculara el precio final
                      considerando todos los costos de Mercado Libre.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Perfiles guardados */}
                    <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                      <Label className="font-medium">Perfiles de Precios Guardados</Label>
                      <div className="flex flex-wrap gap-2">
                        {priceProfiles.map((profile) => (
                          <div key={profile.id} className="flex items-center gap-1">
                            <Button
                              variant={selectedProfileId === profile.id ? "default" : "outline"}
                              size="sm"
                              onClick={() => loadProfile(profile)}
                              className={selectedProfileId === profile.id ? "" : "bg-transparent"}
                            >
                              {profile.name} ({profile.margin_percent}%)
                              {profile.is_default && <Badge variant="secondary" className="ml-1 text-xs">Default</Badge>}
                            </Button>
                            {!profile.is_default && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteProfile(profile.id)}
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                              >
                                x
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-2 border-t">
                        <Input
                          placeholder="Nombre del perfil"
                          value={newProfileName}
                          onChange={(e) => setNewProfileName(e.target.value)}
                          className="max-w-[200px]"
                        />
                        <Button 
                          onClick={saveProfile} 
                          disabled={savingProfile || !newProfileName.trim()}
                          variant="outline"
                          size="sm"
                          className="bg-transparent"
                        >
                          {savingProfile ? "Guardando..." : "Guardar como perfil"}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="margin">Margen de ganancia deseado (%)</Label>
                        <div className="flex items-center gap-4">
                          <Input
                            id="margin"
                            type="number"
                            min="0"
                            max="100"
                            value={marginPercent}
                            onChange={(e) => setMarginPercent(Number(e.target.value))}
                            className="w-24"
                          />
                          <span className="text-2xl font-bold text-primary">{marginPercent}%</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="testCost">Costo de prueba (EUR)</Label>
                        <div className="flex items-center gap-4">
                          <Input
                            id="testCost"
                            type="number"
                            min="0"
                            step="0.01"
                            value={testCostEur}
                            onChange={(e) => setTestCostEur(Number(e.target.value))}
                            className="w-24"
                          />
                          <span className="text-muted-foreground">EUR {testCostEur.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <Button 
                      onClick={calculatePrice} 
                      disabled={calculating}
                      className="w-full"
                      size="lg"
                    >
                      {calculating ? "Calculando..." : "Calcular Precio"}
                    </Button>
                  </CardContent>
                </Card>

                {/* Panel de resultados */}
                <Card>
                  <CardHeader>
                    <CardTitle>Desglose de Costos</CardTitle>
                    <CardDescription>
                      Valores utilizados en la formula de precio
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {priceCalculation ? (
                      <div className="space-y-6">
                        {/* Precio final destacado */}
                        <div className="rounded-lg bg-primary/10 p-4 text-center">
                          <p className="text-sm text-muted-foreground">Precio de venta en ML</p>
                          <p className="text-4xl font-bold text-primary">
                            ${priceCalculation.final_price_ars.toLocaleString("es-AR")}
                          </p>
                          <p className="mt-2 text-lg font-semibold">
                            Multiplicador: {(priceCalculation.final_price_ars / priceCalculation.cost_price_eur).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            EUR 1 = ARS {(priceCalculation.final_price_ars / priceCalculation.cost_price_eur).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                          </p>
                        </div>

                        {/* Tabla de costos */}
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Concepto</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <TableRow>
                              <TableCell className="font-medium">Costo producto</TableCell>
                              <TableCell className="text-right">EUR {priceCalculation.cost_price_eur.toFixed(2)}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Tipo de cambio (EUR billetes BNA)</TableCell>
                              <TableCell className="text-right">${priceCalculation.exchange_rate.toLocaleString("es-AR")}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Costo en ARS</TableCell>
                              <TableCell className="text-right">${priceCalculation.cost_in_ars.toLocaleString("es-AR")}</TableCell>
                            </TableRow>
                            <TableRow className="bg-muted/50">
                              <TableCell className="font-medium">Margen deseado</TableCell>
                              <TableCell className="text-right">{priceCalculation.margin_percent}%</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Comision ML</TableCell>
                              <TableCell className="text-right">{priceCalculation.ml_fee_percent}%</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Cargo fijo ML</TableCell>
                              <TableCell className="text-right">${priceCalculation.ml_fixed_fee.toLocaleString("es-AR")}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Costo envio gratis</TableCell>
                              <TableCell className="text-right">${priceCalculation.shipping_cost.toLocaleString("es-AR")}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>

                        {/* Verificacion */}
                        <div className="rounded-lg border p-4 space-y-2">
                          <h4 className="font-semibold text-sm">Verificacion</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <span className="text-muted-foreground">Comision ML ({priceCalculation.ml_fee_percent}%):</span>
                            <span className="text-right">-${priceCalculation.verification.ml_commission.toLocaleString("es-AR")}</span>
                            
                            <span className="text-muted-foreground">Cargo fijo ML:</span>
                            <span className="text-right">-${priceCalculation.ml_fixed_fee.toLocaleString("es-AR")}</span>
                            
                            <span className="text-muted-foreground">Costo envio:</span>
                            <span className="text-right">-${priceCalculation.verification.shipping_cost.toLocaleString("es-AR")}</span>
                            
                            <span className="text-muted-foreground">Total costos ML:</span>
                            <span className="text-right font-medium">-${priceCalculation.verification.total_costs.toLocaleString("es-AR")}</span>
                            
                            <span className="text-muted-foreground">Neto recibido:</span>
                            <span className="text-right">${priceCalculation.verification.net_received.toLocaleString("es-AR")}</span>
                            
                            <span className="text-muted-foreground">Ganancia:</span>
                            <span className="text-right text-green-600 font-medium">+${priceCalculation.verification.profit_ars.toLocaleString("es-AR")}</span>
                            
                            <span className="text-muted-foreground">Margen real:</span>
                            <span className="text-right font-bold text-primary">{priceCalculation.verification.actual_margin_percent}%</span>
                          </div>
                        </div>

                        {/* Boton aplicar */}
                        <Button 
                          onClick={applyMarginToTemplate}
                          variant="outline"
                          className="w-full bg-transparent"
                        >
                          Aplicar margen a plantilla activa
                        </Button>
                      </div>
                    ) : (
                      <div className="flex h-64 items-center justify-center text-muted-foreground">
                        <p>Configura el margen y haz clic en Calcular</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
            
            {/* Seccion 2: Analisis Umbral $33,000 */}
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4">Optimizador de Umbral $33,000</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Para un producto dado, compara si conviene fijarlo debajo de $33,000 (cargo fijo, sin envio gratis) 
                o arriba (sin cargo fijo, con envio gratis). Considera que con envio gratis se vende mas.
              </p>
              
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Panel de configuracion */}
                <Card>
                  <CardHeader>
                    <CardTitle>Configurar Analisis</CardTitle>
                    <CardDescription>
                      Define el costo del producto y el rango de margen aceptable
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Costo del producto (EUR)</Label>
                      <Input
                        type="number"
                        min="1"
                        step="0.5"
                        value={thresholdCostEur}
                        onChange={(e) => setThresholdCostEur(Number(e.target.value))}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Margen minimo (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={marginMin}
                          onChange={(e) => setMarginMin(Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Margen maximo (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={marginMax}
                          onChange={(e) => setMarginMax(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      Rango aceptable: {marginMin}% - {marginMax}%
                    </p>
                    
                    <Button 
                      onClick={analyzeThreshold}
                      disabled={calculatingThreshold}
                      className="w-full"
                      size="lg"
                    >
                      {calculatingThreshold ? "Analizando..." : "Analizar Opciones"}
                    </Button>
                  </CardContent>
                </Card>

                {/* Panel de resultados */}
                <Card>
                  <CardHeader>
                    <CardTitle>Comparativa</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {thresholdAnalysis ? (
                      <div className="space-y-6">
                        {/* Info del producto */}
                        <div className="text-sm text-center pb-4 border-b">
                          <span className="text-muted-foreground">Producto: </span>
                          <span className="font-medium">EUR {thresholdAnalysis.costEur}</span>
                          <span className="text-muted-foreground"> = </span>
                          <span className="font-medium">${thresholdAnalysis.costArs.toLocaleString("es-AR")}</span>
                          <span className="text-muted-foreground text-xs"> (TC: ${thresholdAnalysis.exchangeRate})</span>
                        </div>
                        
                        {/* Recomendacion */}
                        <div className={`rounded-lg p-4 text-center ${
                          thresholdAnalysis.recommendation === "below" 
                            ? "bg-blue-500/10 border border-blue-500/30" 
                            : thresholdAnalysis.recommendation === "above"
                            ? "bg-green-500/10 border border-green-500/30"
                            : "bg-yellow-500/10 border border-yellow-500/30"
                        }`}>
                          <p className="text-sm text-muted-foreground">Recomendacion</p>
                          <p className="text-lg font-bold">
                            {thresholdAnalysis.recommendation === "below" && "Fijar en $32,999"}
                            {thresholdAnalysis.recommendation === "above" && "Publicar arriba de $33,000"}
                            {thresholdAnalysis.recommendation === "either" && "Ambas opciones validas"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">{thresholdAnalysis.reason}</p>
                        </div>

                        {/* Comparativa lado a lado */}
                        <div className="grid grid-cols-2 gap-4">
                          {/* Debajo de $33k */}
                          <div className={`rounded-lg border p-4 ${
                            thresholdAnalysis.below33k.withinRange ? "border-blue-500/50 bg-blue-500/5" : "opacity-60"
                          }`}>
                            <p className="text-xs text-muted-foreground mb-2 text-center">Debajo de $33k</p>
                            <p className="text-2xl font-bold text-center text-blue-600">
                              ${thresholdAnalysis.below33k.price.toLocaleString("es-AR")}
                            </p>
                            <div className="mt-3 space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Margen:</span>
                                <span className={thresholdAnalysis.below33k.withinRange ? "text-green-600 font-medium" : "text-red-500"}>
                                  {thresholdAnalysis.below33k.margin}%
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Multiplicador:</span>
                                <span>{thresholdAnalysis.below33k.multiplier.toLocaleString("es-AR")}x</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Cargo fijo:</span>
                                <span>-${thresholdAnalysis.below33k.fixedFee.toLocaleString("es-AR")}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Envio:</span>
                                <span>$0</span>
                              </div>
                              <div className="flex justify-between pt-2 border-t">
                                <span className="text-muted-foreground">Ganancia:</span>
                                <span className="font-medium">${thresholdAnalysis.below33k.netProfit.toLocaleString("es-AR")}</span>
                              </div>
                            </div>
                            <p className="text-xs text-center mt-3 text-muted-foreground">Sin envio gratis</p>
                          </div>
                          
                          {/* Arriba de $33k */}
                          <div className={`rounded-lg border p-4 ${
                            thresholdAnalysis.above33k.withinRange ? "border-green-500/50 bg-green-500/5" : "opacity-60"
                          }`}>
                            <p className="text-xs text-muted-foreground mb-2 text-center">Arriba de $33k</p>
                            <p className="text-2xl font-bold text-center text-green-600">
                              ${thresholdAnalysis.above33k.price.toLocaleString("es-AR")}</p>
                            <div className="mt-3 space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Margen:</span>
                                <span className={thresholdAnalysis.above33k.withinRange ? "text-green-600 font-medium" : "text-red-500"}>
                                  {thresholdAnalysis.above33k.margin}%
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Multiplicador:</span>
                                <span>{thresholdAnalysis.above33k.multiplier.toLocaleString("es-AR")}x</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Cargo fijo:</span>
                                <span>$0</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Envio:</span>
                                <span>-${thresholdAnalysis.above33k.shippingCost.toLocaleString("es-AR")}</span>
                              </div>
                              <div className="flex justify-between pt-2 border-t">
                                <span className="text-muted-foreground">Ganancia:</span>
                                <span className="font-medium">${thresholdAnalysis.above33k.netProfit.toLocaleString("es-AR")}</span>
                              </div>
                            </div>
                            <p className="text-xs text-center mt-3 text-green-600 font-medium">Con envio gratis</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-64 items-center justify-center text-muted-foreground">
                        <p>Configura el producto y haz clic en Analizar</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="analyze" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Analizar Publicacion Existente</CardTitle>
                <CardDescription>
                  Ingresa el ID de una publicacion de ML para extraer sus datos y generar una plantilla automatica.
                  El sistema buscara el producto en el catalogo de Arnoia por EAN/ISBN.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Input
                    placeholder="ID de publicacion (ej: MLA1234567890)"
                    value={itemIdToAnalyze}
                    onChange={(e) => setItemIdToAnalyze(e.target.value)}
                    className="max-w-md"
                  />
                  <Button onClick={analyzeItem} disabled={analyzing}>
                    {analyzing ? "Analizando..." : "Analizar"}
                  </Button>
                </div>

                {analysisResult && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <h3 className="font-semibold">Resultado del Analisis</h3>
                    
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="mb-2 text-sm font-medium">Publicacion de ML</h4>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-muted-foreground">Titulo:</span> {analysisResult.ml_item.title}</p>
                          <p><span className="text-muted-foreground">Precio:</span> ${analysisResult.ml_item.price}</p>
                          <p><span className="text-muted-foreground">SKU/EAN:</span> {analysisResult.ean_found || "No encontrado"}</p>
                          <p><span className="text-muted-foreground">Tipo:</span> {analysisResult.ml_item.listing_type_id}</p>
                          <p><span className="text-muted-foreground">Condicion:</span> {analysisResult.ml_item.condition}</p>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="mb-2 text-sm font-medium">Producto del Catalogo</h4>
                        {analysisResult.catalog_product ? (
                          <div className="space-y-1 text-sm">
                            <p><span className="text-muted-foreground">Titulo:</span> {analysisResult.catalog_product.title}</p>
                            <p><span className="text-muted-foreground">Precio:</span> ${analysisResult.catalog_product.price}</p>
                            <p><span className="text-muted-foreground">Costo:</span> ${analysisResult.catalog_product.cost_price || "N/A"}</p>
                            <p><span className="text-muted-foreground">Stock:</span> {analysisResult.catalog_product.stock}</p>
                            <p><span className="text-muted-foreground">Autor:</span> {analysisResult.catalog_product.author || "N/A"}</p>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No se encontro producto en el catalogo con EAN: {analysisResult.ean_found}</p>
                        )}
                      </div>
                    </div>

                    {analysisResult.ml_item.attributes && Object.keys(analysisResult.ml_item.attributes).length > 0 && (
                      <div>
                        <h4 className="mb-2 text-sm font-medium">Atributos de ML</h4>
                        <div className="max-h-48 overflow-auto rounded border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Object.entries(analysisResult.ml_item.attributes).slice(0, 20).map(([id, attr]: [string, any]) => (
                                <TableRow key={id}>
                                  <TableCell className="font-mono text-xs">{id}</TableCell>
                                  <TableCell>{attr.name}</TableCell>
                                  <TableCell>{attr.value}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    <Button onClick={() => setShowEditor(true)}>
                      Crear plantilla basada en este analisis
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Editor de plantilla */}
        <Dialog open={showEditor} onOpenChange={setShowEditor}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}</DialogTitle>
              <DialogDescription>
                Configura los parametros de la plantilla para publicaciones automaticas
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={templateForm.is_default}
                    onCheckedChange={(checked) => setTemplateForm({ ...templateForm, is_default: checked })}
                  />
                  <Label>Plantilla principal</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descripcion</Label>
                <Textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  placeholder="Descripcion opcional de la plantilla"
                />
              </div>

              <div className="space-y-2">
                <Label>Plantilla de titulo</Label>
                <Input
                  value={templateForm.title_template}
                  onChange={(e) => setTemplateForm({ ...templateForm, title_template: e.target.value })}
                  placeholder="{title} - {author}"
                />
                <p className="text-xs text-muted-foreground">
                  Variables: {"{title}"}, {"{author}"}, {"{brand}"}, {"{ean}"}, {"{year_edition}"}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Tipo de publicacion</Label>
                  <Select
                    value={templateForm.listing_type_id}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, listing_type_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gold_special">Premium (gold_special)</SelectItem>
                      <SelectItem value="gold_pro">Clasica (gold_pro)</SelectItem>
                      <SelectItem value="gold">Oro</SelectItem>
                      <SelectItem value="silver">Plata</SelectItem>
                      <SelectItem value="bronze">Bronce</SelectItem>
                      <SelectItem value="free">Gratuita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Condicion</Label>
                  <Select
                    value={templateForm.condition}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, condition: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Nuevo</SelectItem>
                      <SelectItem value="used">Usado</SelectItem>
                      <SelectItem value="refurbished">Reacondicionado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Moneda</Label>
                  <Select
                    value={templateForm.currency_id}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, currency_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARS">ARS (Peso argentino)</SelectItem>
                      <SelectItem value="USD">USD (Dolar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Formula de precio</Label>
                <Input
                  value={templateForm.price_formula}
                  onChange={(e) => setTemplateForm({ ...templateForm, price_formula: e.target.value })}
                  placeholder="price * 1.5 o cost_price * 2.0"
                />
                <p className="text-xs text-muted-foreground">
                  Variables: price (precio del catalogo), cost_price (costo)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Perfil de Precio</Label>
                <Select
                  value={templateForm.price_profile_id}
                  onValueChange={(value) => {
                    const selectedProfile = priceProfiles.find(p => p.id === value)
                    setTemplateForm({ 
                      ...templateForm, 
                      price_profile_id: value,
                      price_formula: selectedProfile ? `margin:${selectedProfile.margin_percent}%` : templateForm.price_formula
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {priceProfiles.map(profile => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name} ({profile.margin_percent}%) {profile.is_default && "★"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-1">
                  {templateForm.price_profile_id ? (
                    <>El perfil seleccionado actualizará la fórmula automáticamente. Cambios en "Calculadora de precios" se reflejan aquí.</>
                  ) : (
                    <>Selecciona un perfil o ve a "Calculadora de precios" para crear uno.</>
                  )}
                </p>
              </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => loadProfile(profile)}>
                              Cargar
                            </Button>
                            {!profile.is_default && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    const response = await fetch("/api/price-profiles", {
                                      method: "PUT",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ id: profile.id, is_default: true })
                                    })
                                    if (response.ok) {
                                      toast({ title: "Perfil establecido como por defecto" })
                                      fetchPriceProfiles()
                                    }
                                  } catch (error) {
                                    toast({ title: "Error", variant: "destructive" })
                                  }
                                }}
                              >
                                ★ Por defecto
                              </Button>
                            )}
                            <Button size="sm" variant="destructive" onClick={() => deleteProfile(profile.id)}>
                              Eliminar
                            </Button>
                          </div>
                        </div>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-1">
                  Este perfil determina el margen de ganancia. Ve a "Calculadora de precios" para gestionar perfiles.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Días de disponibilidad</Label>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={templateForm.handling_days}
                    onChange={(e) => setTemplateForm({ ...templateForm, handling_days: parseInt(e.target.value) || 3 })}
                  />
                  <p className="text-sm text-muted-foreground">
                    Tiempo de preparación del envío (1-30 días)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Modo de envio</Label>
                  <Select
                    value={templateForm.shipping_mode}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, shipping_mode: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="me2">Mercado Envios 2</SelectItem>
                      <SelectItem value="me1">Mercado Envios 1</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                      <SelectItem value="not_specified">No especificado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={templateForm.free_shipping}
                    onCheckedChange={(checked) => setTemplateForm({ ...templateForm, free_shipping: checked })}
                  />
                  <Label>Envio gratis</Label>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={templateForm.local_pick_up}
                    onCheckedChange={(checked) => setTemplateForm({ ...templateForm, local_pick_up: checked })}
                  />
                  <Label>Retiro en persona</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Garantia</Label>
                <Input
                  value={templateForm.warranty}
                  onChange={(e) => setTemplateForm({ ...templateForm, warranty: e.target.value })}
                  placeholder="30 días de garantía"
                />
              </div>

              <div className="space-y-2">
                <Label>Plantilla de Descripcion</Label>
                <Textarea
                  value={templateForm.description_template}
                  onChange={(e) => setTemplateForm({ ...templateForm, description_template: e.target.value })}
                  placeholder="Descripcion de la publicacion con variables como {title}, {author}, {brand}, {description}, {ean}, {pages}, {language}, {binding}, {subject}"
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Variables disponibles: {"{title}"}, {"{author}"}, {"{brand}"}, {"{description}"}, {"{ean}"}, {"{pages}"}, {"{language}"}, {"{binding}"}, {"{subject}"}, {"{category}"}, {"{year_edition}"}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowEditor(false)}>
                  Cancelar
                </Button>
                <Button onClick={saveTemplate} disabled={saving}>
                  {saving ? "Guardando..." : "Guardar Plantilla"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
