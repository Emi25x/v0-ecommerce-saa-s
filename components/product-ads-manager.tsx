"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Megaphone, Plus, Play, Pause, Info } from "lucide-react"

interface Campaign {
  id: string
  name: string
  status: "active" | "paused" | "ended"
  daily_budget: number
  spent: number
  impressions: number
  clicks: number
  conversions: number
}

interface ProductAdsManagerProps {
  selectedProducts: Set<string>
}

export function ProductAdsManager({ selectedProducts }: ProductAdsManagerProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    daily_budget: "",
    bid_amount: "",
  })

  useEffect(() => {
    loadCampaigns()
  }, [])

  const loadCampaigns = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/mercadolibre/ads/campaigns")
      if (response.ok) {
        const data = await response.json()
        setCampaigns(data.campaigns || [])
      }
    } catch (error) {
      console.error("Failed to load campaigns:", error)
    } finally {
      setLoading(false)
    }
  }

  const createCampaign = async () => {
    if (!newCampaign.name || !newCampaign.daily_budget || !newCampaign.bid_amount) {
      alert("Por favor completa todos los campos")
      return
    }

    if (selectedProducts.size === 0) {
      alert("Selecciona al menos un producto para la campaña")
      return
    }

    try {
      setLoading(true)
      const response = await fetch("/api/mercadolibre/ads/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCampaign.name,
          product_ids: Array.from(selectedProducts),
          daily_budget: Number.parseFloat(newCampaign.daily_budget),
          bid_amount: Number.parseFloat(newCampaign.bid_amount),
        }),
      })

      if (response.ok) {
        alert("Campaña creada exitosamente")
        setShowCreateDialog(false)
        setNewCampaign({ name: "", daily_budget: "", bid_amount: "" })
        loadCampaigns()
      } else {
        const error = await response.json()
        alert(`Error: ${error.details || error.error}`)
      }
    } catch (error) {
      console.error("Failed to create campaign:", error)
      alert("Error al crear la campaña")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Product Ads
            </CardTitle>
            <CardDescription>Gestiona tus campañas publicitarias en Mercado Libre</CardDescription>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Nueva Campaña
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Campaña de Product Ads</DialogTitle>
                <DialogDescription>Crea una campaña publicitaria para los productos seleccionados</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    {selectedProducts.size > 0
                      ? `Se crearán anuncios para ${selectedProducts.size} producto(s) seleccionado(s)`
                      : "Selecciona productos en la tabla para crear una campaña"}
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="campaign-name">Nombre de la Campaña</Label>
                  <Input
                    id="campaign-name"
                    placeholder="Ej: Campaña Verano 2025"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="daily-budget">Presupuesto Diario (ARS)</Label>
                  <Input
                    id="daily-budget"
                    type="number"
                    placeholder="1000"
                    value={newCampaign.daily_budget}
                    onChange={(e) => setNewCampaign({ ...newCampaign, daily_budget: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Monto máximo a gastar por día</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bid-amount">Puja por Clic (ARS)</Label>
                  <Input
                    id="bid-amount"
                    type="number"
                    placeholder="50"
                    value={newCampaign.bid_amount}
                    onChange={(e) => setNewCampaign({ ...newCampaign, bid_amount: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Cuánto pagarás por cada clic en tu anuncio</p>
                </div>

                <Button onClick={createCampaign} disabled={loading || selectedProducts.size === 0} className="w-full">
                  {loading ? "Creando..." : "Crear Campaña"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Megaphone className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
            <p className="text-sm text-muted-foreground">No tienes campañas activas</p>
            <p className="text-xs text-muted-foreground">Crea tu primera campaña para impulsar tus ventas</p>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((campaign) => (
              <Card key={campaign.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{campaign.name}</h4>
                        <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                          {campaign.status === "active"
                            ? "Activa"
                            : campaign.status === "paused"
                              ? "Pausada"
                              : "Finalizada"}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                        <div>
                          <p className="text-muted-foreground">Presupuesto Diario</p>
                          <p className="font-medium">${campaign.daily_budget.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Gastado</p>
                          <p className="font-medium">${campaign.spent.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Impresiones</p>
                          <p className="font-medium">{campaign.impressions.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Clics</p>
                          <p className="font-medium">{campaign.clicks.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="icon">
                        {campaign.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
