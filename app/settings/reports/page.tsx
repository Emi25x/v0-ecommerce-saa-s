"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Download, Mail, Loader2 } from "lucide-react"

export default function ReportsSettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [emails, setEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState("")
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0])

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/reports/settings")
      const data = await res.json()
      setSettings(data.settings || {})
      setEmails(data.settings?.email_recipients || [])
    } catch (error) {
      console.error("Error fetching settings:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch("/api/reports/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          email_recipients: emails
        })
      })
      alert("Configuración guardada")
    } catch (error) {
      console.error("Error saving settings:", error)
      alert("Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateReport = async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/reports/daily-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          send_email: false
        })
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `ventas-${selectedDate}.xlsx`
        a.click()
      } else {
        alert("Error generando reporte")
      }
    } catch (error) {
      console.error("Error generating report:", error)
      alert("Error al generar reporte")
    } finally {
      setGenerating(false)
    }
  }

  const handleSendReport = async () => {
    setGenerating(true)
    try {
      await fetch("/api/reports/daily-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          send_email: true,
          email_recipients: emails
        })
      })
      alert("Reporte enviado por email")
    } catch (error) {
      console.error("Error sending report:", error)
      alert("Error al enviar reporte")
    } finally {
      setGenerating(false)
    }
  }

  const addEmail = () => {
    if (newEmail && !emails.includes(newEmail)) {
      setEmails([...emails, newEmail])
      setNewEmail("")
    }
  }

  const removeEmail = (email: string) => {
    setEmails(emails.filter(e => e !== email))
  }

  if (loading) {
    return <div className="p-8">Cargando...</div>
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuración de Reportes</h1>
        <p className="text-muted-foreground">
          Configura el envío automático de reportes diarios de ventas
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reporte Diario de Ventas</CardTitle>
          <CardDescription>
            Configura el envío automático de ventas en formato Excel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Activar envío automático</Label>
              <p className="text-sm text-muted-foreground">
                Se enviará automáticamente todos los días a la 1:00 AM (ventas del día anterior)
              </p>
            </div>
            <Switch
              checked={settings?.enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
            />
          </div>

          <div className="space-y-4">
            <Label>Destinatarios de Email</Label>
            <div className="flex gap-2">
              <Input
                placeholder="email@ejemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addEmail()}
              />
              <Button onClick={addEmail}>Agregar</Button>
            </div>
            <div className="space-y-2">
              {emails.map((email) => (
                <div key={email} className="flex items-center justify-between p-2 bg-muted rounded">
                  <span>{email}</span>
                  <Button variant="ghost" size="sm" onClick={() => removeEmail(email)}>
                    Eliminar
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar Configuración
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generar Reporte Manual</CardTitle>
          <CardDescription>
            Genera y descarga el reporte de ventas de un día específico
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Seleccionar Fecha</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerateReport} disabled={generating} variant="outline">
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Descargar Excel
            </Button>
            <Button onClick={handleSendReport} disabled={generating || emails.length === 0}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Enviar por Email
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
