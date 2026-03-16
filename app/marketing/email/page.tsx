"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { PLATFORMS } from "@/lib/marketing/platforms"
import Link from "next/link"

const EMAIL_PLATFORMS = ["klaviyo", "mailchimp", "brevo", "hubspot", "activecampaign", "whatsapp"] as const
type EmailPlatform = typeof EMAIL_PLATFORMS[number]

function fmtPct(v: number) {
  if (!v && v !== 0) return "-"
  return `${v.toFixed(1)}%`
}
function fmt(v: number) {
  if (!v && v !== 0) return "-"
  return v.toLocaleString("es-AR")
}
function fmtDate(d: string | null) {
  if (!d) return "-"
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" })
}

const STATUS_COLORS: Record<string, string> = {
  sent: "text-green-600 border-green-600",
  sending: "text-blue-600 border-blue-600",
  draft: "text-gray-500 border-gray-400",
  scheduled: "text-purple-600 border-purple-600",
  paused: "text-yellow-600 border-yellow-600",
  ACTIVE: "text-green-600 border-green-600",
  DRAFT: "text-gray-500 border-gray-400",
  SCHEDULED: "text-purple-600 border-purple-600",
  PAUSED: "text-yellow-600 border-yellow-600",
  SENT: "text-green-600 border-green-600",
  Published: "text-green-600 border-green-600",
  Draft: "text-gray-500 border-gray-400",
}

export default function EmailMarketingPage() {
  const [activeTab, setActiveTab] = useState<EmailPlatform>("klaviyo")
  const [data, setData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [connections, setConnections] = useState<Record<string, boolean>>({})
  const { toast } = useToast()

  useEffect(() => {
    checkConnections()
  }, [])

  useEffect(() => {
    if (connections[activeTab] && !data[activeTab]) {
      fetchPlatformData(activeTab)
    }
  }, [activeTab, connections])

  async function checkConnections() {
    try {
      const res = await fetch("/api/marketing/connections")
      const d = await res.json()
      const map: Record<string, boolean> = {}
      for (const c of d.connections ?? []) map[c.platform] = c.is_active
      setConnections(map)
    } catch {
      toast({ title: "Error al cargar conexiones", variant: "destructive" })
    }
  }

  async function fetchPlatformData(platform: EmailPlatform) {
    setLoading(p => ({ ...p, [platform]: true }))
    try {
      const res = await fetch(`/api/marketing/email/${platform}`)
      if (!res.ok) throw new Error(`Error al cargar ${platform}`)
      const json = await res.json()
      setData(p => ({ ...p, [platform]: json }))
    } catch (e: any) {
      toast({ title: `Error ${platform}`, description: e.message, variant: "destructive" })
    } finally {
      setLoading(p => ({ ...p, [platform]: false }))
    }
  }

  function getPlatformDef(id: string) {
    return PLATFORMS.find(p => p.id === id)
  }

  function NotConnected({ platform }: { platform: string }) {
    const def = getPlatformDef(platform)
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: `${def?.color ?? "#666"}20` }}>
          <div className="w-7 h-7 rounded-full" style={{ backgroundColor: def?.color ?? "#666" }} />
        </div>
        <h3 className="text-lg font-semibold mb-1">{def?.name ?? platform} no conectado</h3>
        <p className="text-muted-foreground text-sm mb-4">Configura las credenciales para ver tus campañas</p>
        <Button size="sm" asChild>
          <Link href="/marketing/config">Conectar</Link>
        </Button>
      </div>
    )
  }

  function CampaignTable({ campaigns }: { campaigns: any[] }) {
    if (!campaigns || campaigns.length === 0) {
      return <div className="text-center py-8 text-muted-foreground">No hay campañas</div>
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Nombre</th>
              <th className="text-left py-2 px-4 font-medium text-muted-foreground">Estado</th>
              <th className="text-left py-2 px-4 font-medium text-muted-foreground">Enviado</th>
              <th className="text-right py-2 px-4 font-medium text-muted-foreground">Destinatarios</th>
              <th className="text-right py-2 px-4 font-medium text-muted-foreground">Aperturas</th>
              <th className="text-right py-2 px-4 font-medium text-muted-foreground">Clics</th>
              <th className="text-right py-2 px-4 font-medium text-muted-foreground">Open Rate</th>
              <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Click Rate</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c: any) => (
              <tr key={c.id} className="border-b hover:bg-muted/30">
                <td className="py-2 pr-4 font-medium max-w-[180px] truncate">{c.name || c.subject || "Sin nombre"}</td>
                <td className="py-2 px-4">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] ?? "text-gray-500 border-gray-400"}`}>
                    {c.status}
                  </Badge>
                </td>
                <td className="py-2 px-4 text-muted-foreground">{fmtDate(c.send_time || c.sdate)}</td>
                <td className="text-right py-2 px-4">{fmt(c.emails_sent || c.recipients || c.sends || 0)}</td>
                <td className="text-right py-2 px-4">{fmt(c.opens || 0)}</td>
                <td className="text-right py-2 px-4">{fmt(c.clicks || 0)}</td>
                <td className="text-right py-2 px-4">{fmtPct(c.open_rate || 0)}</td>
                <td className="text-right py-2 pl-4">{fmtPct(c.click_rate || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  function KlaviyoContent() {
    const d = data.klaviyo
    if (!d) return null
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{d.campaigns?.length ?? 0}</div>
              <p className="text-sm text-muted-foreground">Campañas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{d.lists?.length ?? 0}</div>
              <p className="text-sm text-muted-foreground">Listas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{d.flows?.length ?? 0}</div>
              <p className="text-sm text-muted-foreground">Flows activos</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Campañas</CardTitle></CardHeader>
          <CardContent><CampaignTable campaigns={d.campaigns ?? []} /></CardContent>
        </Card>

        {d.lists && d.lists.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Listas de Suscriptores</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {d.lists.map((l: any) => (
                  <div key={l.id} className="p-3 rounded-lg border">
                    <div className="font-medium text-sm truncate">{l.name}</div>
                    <div className="text-muted-foreground text-xs">{fmt(l.profile_count ?? 0)} perfiles</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {d.flows && d.flows.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Flows de Automatización</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Nombre</th>
                      <th className="text-left py-2 px-4 font-medium text-muted-foreground">Estado</th>
                      <th className="text-left py-2 pl-4 font-medium text-muted-foreground">Trigger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.flows.map((f: any) => (
                      <tr key={f.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-4 font-medium">{f.name}</td>
                        <td className="py-2 px-4">
                          <Badge variant="outline" className={`text-xs ${STATUS_COLORS[f.status] ?? ""}`}>
                            {f.status}
                          </Badge>
                        </td>
                        <td className="py-2 pl-4 text-muted-foreground text-xs">{f.trigger_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  function WhatsAppContent() {
    const d = data.whatsapp
    if (!d) return null
    return (
      <div className="space-y-6">
        {d.phone && (
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">{d.phone.verified_name}</div>
                  <div className="text-sm text-muted-foreground">{d.phone.display_phone_number} · Quality: {d.phone.quality_rating}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Templates de Mensajes</CardTitle>
            <CardDescription>{d.templates?.length ?? 0} templates disponibles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Nombre</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">Categoría</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">Idioma</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">Estado</th>
                    <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Componentes</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.templates ?? []).map((t: any) => (
                    <tr key={t.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 pr-4 font-medium font-mono text-xs">{t.name}</td>
                      <td className="py-2 px-4">
                        <Badge variant="outline" className="text-xs">{t.category}</Badge>
                      </td>
                      <td className="py-2 px-4 text-muted-foreground">{t.language}</td>
                      <td className="py-2 px-4">
                        <Badge variant="outline" className={`text-xs ${t.status === "APPROVED" ? "text-green-600 border-green-600" : t.status === "REJECTED" ? "text-red-600 border-red-600" : ""}`}>
                          {t.status}
                        </Badge>
                      </td>
                      <td className="text-right py-2 pl-4">{t.components}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  function GenericEmailContent({ platform }: { platform: EmailPlatform }) {
    const d = data[platform]
    if (!d) return null
    return (
      <div className="space-y-6">
        {d.contacts && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{fmt(d.contacts.total ?? 0)}</div>
              <p className="text-sm text-muted-foreground">Contactos totales</p>
            </CardContent>
          </Card>
        )}
        {d.lists && (
          <Card>
            <CardHeader><CardTitle>Audiencias</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {d.lists.map((l: any) => (
                  <div key={l.id} className="p-3 rounded-lg border">
                    <div className="font-medium text-sm truncate">{l.name}</div>
                    <div className="text-muted-foreground text-xs">{fmt(l.member_count ?? 0)} miembros</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Campañas</CardTitle></CardHeader>
          <CardContent><CampaignTable campaigns={d.campaigns ?? []} /></CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/marketing">
              <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Marketing
            </Link>
          </Button>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-bold">Email & CRM</h1>
        </div>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as EmailPlatform)}>
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            {EMAIL_PLATFORMS.map(platform => {
              const def = getPlatformDef(platform)
              const isConnected = connections[platform]
              return (
                <TabsTrigger key={platform} value={platform} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: def?.color ?? "#666" }} />
                  {def?.name ?? platform}
                  {isConnected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 ml-0.5" />
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>

          {EMAIL_PLATFORMS.map(platform => (
            <TabsContent key={platform} value={platform}>
              {!connections[platform] ? (
                <NotConnected platform={platform} />
              ) : loading[platform] ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    {[1,2,3].map(i => <Card key={i}><CardContent className="pt-6"><Skeleton className="h-8 w-16 mb-2" /><Skeleton className="h-4 w-20" /></CardContent></Card>)}
                  </div>
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : !data[platform] ? (
                <div className="text-center py-8">
                  <Button onClick={() => fetchPlatformData(platform)}>Cargar datos</Button>
                </div>
              ) : platform === "klaviyo" ? (
                <KlaviyoContent />
              ) : platform === "whatsapp" ? (
                <WhatsAppContent />
              ) : (
                <GenericEmailContent platform={platform} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}
