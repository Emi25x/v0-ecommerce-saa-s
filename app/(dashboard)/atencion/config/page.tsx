"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Settings,
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
  Phone,
  Instagram,
  Mail,
  ShoppingBag,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  Zap,
} from "lucide-react"

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Template {
  id: string
  name: string
  category: string | null
  channels: string[]
  body: string
  use_count: number
  is_active: boolean
}

interface ChannelConfig {
  id: string
  channel: string
  name: string
  is_active: boolean
}

const CATEGORIES = [
  { value: "general",   label: "General" },
  { value: "shipping",  label: "Envíos" },
  { value: "returns",   label: "Devoluciones" },
  { value: "stock",     label: "Stock" },
  { value: "payment",   label: "Pagos" },
  { value: "ml_question", label: "Preguntas ML" },
]

const CHANNEL_OPTIONS = [
  { value: "ml_question", label: "ML Preguntas", icon: <ShoppingBag className="h-3.5 w-3.5" /> },
  { value: "whatsapp",    label: "WhatsApp",     icon: <Phone className="h-3.5 w-3.5" /> },
  { value: "instagram",   label: "Instagram",    icon: <Instagram className="h-3.5 w-3.5" /> },
  { value: "email",       label: "Email",        icon: <Mail className="h-3.5 w-3.5" /> },
]

const VARIABLE_HINTS = [
  "{{customer_name}}", "{{product_title}}", "{{order_id}}",
  "{{tracking_number}}", "{{store_name}}",
]

// ─── Component ─────────────────────────────────────────────────────────────────
export default function AtencionConfigPage() {
  const [templates, setTemplates]       = useState<Template[]>([])
  const [channelConfigs, setChannelConfigs] = useState<ChannelConfig[]>([])
  const [loading, setLoading]           = useState(false)

  // Template dialog
  const [templateDialog, setTemplateDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [tName, setTName]       = useState("")
  const [tCategory, setTCategory] = useState("")
  const [tBody, setTBody]       = useState("")
  const [savingTemplate, setSavingTemplate] = useState(false)

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/cs/templates")
      const data = await res.json()
      setTemplates(data.templates ?? [])
    } finally {
      setLoading(false)
    }
  }

  const loadChannelConfigs = async () => {
    const res = await fetch("/api/cs/channel-configs")
    const data = await res.json()
    setChannelConfigs(data.configs ?? [])
  }

  useEffect(() => {
    loadTemplates()
    loadChannelConfigs()
  }, [])

  // ── Template CRUD ───────────────────────────────────────────────────────────
  const openNewTemplate = () => {
    setEditingTemplate(null)
    setTName(""); setTCategory("general"); setTBody("")
    setTemplateDialog(true)
  }

  const openEditTemplate = (t: Template) => {
    setEditingTemplate(t)
    setTName(t.name); setTCategory(t.category ?? "general"); setTBody(t.body)
    setTemplateDialog(true)
  }

  const saveTemplate = async () => {
    if (!tName.trim() || !tBody.trim()) return
    setSavingTemplate(true)
    try {
      const url     = editingTemplate ? `/api/cs/templates/${editingTemplate.id}` : "/api/cs/templates"
      const method  = editingTemplate ? "PATCH" : "POST"
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tName.trim(), category: tCategory, body: tBody.trim() }),
      })
      setTemplateDialog(false)
      await loadTemplates()
    } finally {
      setSavingTemplate(false)
    }
  }

  const deleteTemplate = async (id: string) => {
    await fetch(`/api/cs/templates/${id}`, { method: "DELETE" })
    await loadTemplates()
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Configuración — Atención al Cliente
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Administrá plantillas de respuesta y configuraciones de canales.
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Plantillas de respuesta
          </TabsTrigger>
          <TabsTrigger value="channels" className="gap-2">
            <Zap className="h-4 w-4" />
            Canales
          </TabsTrigger>
        </TabsList>

        {/* ── Templates tab ────────────────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Las plantillas permiten responder rápidamente con textos predefinidos.
                Usá <code className="bg-muted px-1 rounded text-xs">{"{{variable}}"}</code> para insertar datos dinámicos.
              </p>
            </div>
            <Button onClick={openNewTemplate} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Nueva plantilla
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No hay plantillas aún</p>
                <Button onClick={openNewTemplate} variant="outline" size="sm">
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Crear primera plantilla
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Vista previa</TableHead>
                    <TableHead className="text-right">Usos</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-sm">{t.name}</TableCell>
                      <TableCell>
                        {t.category && (
                          <Badge variant="secondary" className="text-xs">
                            {CATEGORIES.find(c => c.value === t.category)?.label ?? t.category}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate text-xs text-muted-foreground">{t.body}</p>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {t.use_count}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => openEditTemplate(t)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteTemplate(t.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Channels tab ─────────────────────────────────────────────── */}
        <TabsContent value="channels" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* ML (auto-configured via ml_accounts) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  MercadoLibre
                </CardTitle>
                <CardDescription className="text-xs">
                  Las preguntas y mensajes de ML se sincronizan automáticamente a través de tus cuentas configuradas en la sección ML.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600 dark:text-green-400">Configurado automáticamente</span>
                </div>
              </CardContent>
            </Card>

            {/* WhatsApp */}
            <Card className="border-dashed opacity-60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  WhatsApp Business
                </CardTitle>
                <CardDescription className="text-xs">
                  Conectá tu número de WhatsApp Business a través de la API de Meta Cloud.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Próximamente</span>
                </div>
              </CardContent>
            </Card>

            {/* Instagram */}
            <Card className="border-dashed opacity-60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Instagram className="h-4 w-4" />
                  Instagram DMs
                </CardTitle>
                <CardDescription className="text-xs">
                  Recibí y respondé mensajes directos de Instagram desde el inbox unificado.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Próximamente</span>
                </div>
              </CardContent>
            </Card>

            {/* Email */}
            <Card className="border-dashed opacity-60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </CardTitle>
                <CardDescription className="text-xs">
                  Conectá una casilla de email para centralizar consultas por correo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Próximamente</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Template dialog */}
      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nombre</Label>
                <Input
                  placeholder="ej: Consulta de envío"
                  value={tName}
                  onChange={e => setTName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Categoría</Label>
                <Select value={tCategory} onValueChange={setTCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Texto de la plantilla</Label>
              <Textarea
                className="min-h-[120px] resize-none text-sm"
                placeholder="Hola {{customer_name}}, gracias por tu consulta..."
                value={tBody}
                onChange={e => setTBody(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                {VARIABLE_HINTS.map(v => (
                  <button
                    key={v}
                    className="text-[10px] rounded border px-1.5 py-0.5 font-mono text-muted-foreground hover:bg-muted transition-colors"
                    onClick={() => setTBody(b => b + v)}
                    type="button"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>Cancelar</Button>
            <Button onClick={saveTemplate} disabled={savingTemplate || !tName.trim() || !tBody.trim()}>
              {savingTemplate
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                : <><Save className="mr-2 h-4 w-4" />Guardar</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
