"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  FileText, Plus, Settings, RefreshCw, Building2, Receipt, Key, Globe,
  CheckCircle2, XCircle, Trash2, X, Loader2, Tag, Download,
} from "lucide-react"
import { CONDICION_IVA_OPTS, IVA_OPTS, EMPTY_CONFIG_FORM } from "./types"
import type { ArcaConfig, ConfigFormState } from "./types"

interface ConfigTabProps {
  empresas: ArcaConfig[]
  empresaActivaId: string | null
  setEmpresaActivaId: (id: string) => void
  populateForm: (e: ArcaConfig) => void
  configForm: ConfigFormState
  setConfigForm: (fn: ConfigFormState | ((prev: ConfigFormState) => ConfigFormState)) => void
  cloningFrom: string | null
  setCloningFrom: (id: string | null) => void
  confirmDelete: boolean
  setConfirmDelete: (v: boolean) => void
  deletingEmpresa: boolean
  deleteEmpresa: (id: string) => void
  savingConfig: boolean
  saveConfig: () => void
  configMsg: { type: "ok" | "err"; text: string } | null
  uploadingLogo: boolean
  uploadLogo: (file: File) => void
}

export function ConfigTab({
  empresas, empresaActivaId, setEmpresaActivaId, populateForm,
  configForm, setConfigForm,
  cloningFrom, setCloningFrom,
  confirmDelete, setConfirmDelete,
  deletingEmpresa, deleteEmpresa,
  savingConfig, saveConfig, configMsg,
  uploadingLogo, uploadLogo,
}: ConfigTabProps) {
  return (
    <div className="max-w-2xl space-y-5">

      {/* Banner: creando nuevo PV derivado */}
      {cloningFrom && (() => {
        const origen = empresas.find(e => e.id === cloningFrom)
        return origen ? (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 flex items-start gap-3">
            <Building2 className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-300">Nuevo punto de venta</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Derivando de <span className="font-medium text-foreground">{origen.nombre_empresa || origen.razon_social}</span>.
                El CUIT y certificado ya fueron copiados. Solo completa el numero de punto de venta y el nombre interno.
              </p>
            </div>
            <button
              onClick={() => { setCloningFrom(null); setConfigForm(EMPTY_CONFIG_FORM()) }}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null
      })()}

      {/* ── Empresa selector dentro del tab ── */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-1.5">
            <Label>Empresa a configurar</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {empresas.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => { setEmpresaActivaId(emp.id); populateForm(emp) }}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    configForm.id === emp.id
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {emp.nombre_empresa || emp.razon_social}
                </button>
              ))}
              <button
                onClick={() => { setConfigForm(EMPTY_CONFIG_FORM()); setCloningFrom(null) }}
                className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Nueva
              </button>
            </div>
          </div>
          {configForm.id && (
            <div className="flex-shrink-0">
              {!confirmDelete ? (
                <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5"
                  onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" />Eliminar empresa
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-red-400">Eliminar?</span>
                  <Button size="sm" variant="destructive" onClick={() => deleteEmpresa(configForm.id)}
                    disabled={deletingEmpresa} className="h-7 text-xs gap-1">
                    {deletingEmpresa ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                    Confirmar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Nombre interno ── */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2 text-sm"><Tag className="h-4 w-4" />Nombre interno</h3>
        <div className="space-y-1.5">
          <Label>Nombre para identificar la empresa en el sistema</Label>
          <p className="text-xs text-muted-foreground">Solo visible internamente — no aparece en las facturas.</p>
          <Input
            placeholder="Ej: Mi Tienda ML, Empresa A, Emprendimiento Personal..."
            value={configForm.nombre_empresa}
            onChange={e => setConfigForm(p => ({ ...p, nombre_empresa: e.target.value }))}
          />
        </div>
      </div>

      {/* ── Identidad visual ── */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" />Identidad visual</h3>

        {/* Logo upload */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            {configForm.logo_url ? (
              <div className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={configForm.logo_url}
                  alt="Logo"
                  className="h-20 w-40 object-contain rounded-md border border-border bg-muted/30"
                />
                <button
                  onClick={() => setConfigForm(p => ({ ...p, logo_url: "" }))}
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="h-20 w-40 rounded-md border-2 border-dashed border-border bg-muted/20 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                <Building2 className="h-6 w-6 opacity-40" />
                <span className="text-xs">Sin logo</span>
              </div>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <Label>Logo de la empresa</Label>
            <p className="text-xs text-muted-foreground">PNG o JPG, max. 2MB. Se mostrara en el encabezado de cada factura.</p>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  uploadLogo(file)
                }}
              />
              <span className={`inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium hover:bg-muted/60 transition-colors ${uploadingLogo ? "opacity-60 pointer-events-none" : ""}`}>
                {uploadingLogo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3 rotate-180" />}
                {uploadingLogo ? "Subiendo..." : "Subir logo"}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* ── Datos del emisor (ARCA) ── */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" />Datos fiscales ARCA</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>CUIT (sin guiones)</Label>
            <Input placeholder="20123456780" value={configForm.cuit} onChange={e => setConfigForm(p => ({ ...p, cuit: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Punto de venta</Label>
            <Input type="number" min="1" max="9999" placeholder="1" value={configForm.punto_venta} onChange={e => setConfigForm(p => ({ ...p, punto_venta: e.target.value }))} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Razon social</Label>
            <Input placeholder="Mi Empresa S.R.L." value={configForm.razon_social} onChange={e => setConfigForm(p => ({ ...p, razon_social: e.target.value }))} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Domicilio fiscal</Label>
            <Input placeholder="Av. Corrientes 1234, CABA" value={configForm.domicilio_fiscal} onChange={e => setConfigForm(p => ({ ...p, domicilio_fiscal: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Condicion frente al IVA</Label>
            <Select value={configForm.condicion_iva} onValueChange={v => setConfigForm(p => ({ ...p, condicion_iva: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDICION_IVA_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ambiente</Label>
            <Select value={configForm.ambiente} onValueChange={v => setConfigForm(p => ({ ...p, ambiente: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="homologacion">Homologacion (pruebas)</SelectItem>
                <SelectItem value="produccion">Produccion</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Contacto y redes ── */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Globe className="h-4 w-4" />Contacto y redes sociales</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Telefono</Label>
            <Input placeholder="+54 11 1234-5678" value={configForm.telefono} onChange={e => setConfigForm(p => ({ ...p, telefono: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>WhatsApp</Label>
            <Input placeholder="+54 9 11 1234-5678" value={configForm.whatsapp} onChange={e => setConfigForm(p => ({ ...p, whatsapp: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="info@empresa.com" value={configForm.email} onChange={e => setConfigForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Sitio web</Label>
            <Input placeholder="www.empresa.com" value={configForm.web} onChange={e => setConfigForm(p => ({ ...p, web: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Instagram</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
              <Input className="pl-7" placeholder="miempresa" value={configForm.instagram} onChange={e => setConfigForm(p => ({ ...p, instagram: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Facebook</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
              <Input className="pl-7" placeholder="miempresa" value={configForm.facebook} onChange={e => setConfigForm(p => ({ ...p, facebook: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Contenido de la factura ── */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Receipt className="h-4 w-4" />Contenido de la factura</h3>

        {/* IVA por defecto */}
        <div className="space-y-1.5">
          <Label>Alicuota de IVA por defecto</Label>
          <p className="text-xs text-muted-foreground">Se aplica automaticamente a cada item nuevo al crear una factura.</p>
          <Select
            value={String(configForm.iva_default)}
            onValueChange={v => setConfigForm(p => ({ ...p, iva_default: Number(v) }))}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IVA_OPTS.map(o => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Nota opcional</Label>
          <p className="text-xs text-muted-foreground">Aparece al pie de todas las facturas (ej: "Gracias por su compra", condiciones de devolucion, etc.)</p>
          <Textarea
            placeholder="Gracias por su compra. Ante cualquier consulta contactenos a info@empresa.com"
            className="resize-none h-20 text-sm"
            value={configForm.nota_factura}
            onChange={e => setConfigForm(p => ({ ...p, nota_factura: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Datos para realizar pagos</Label>
          <p className="text-xs text-muted-foreground">CBU, alias, Mercado Pago, etc. Se muestra como seccion destacada en la factura.</p>
          <Textarea
            placeholder={"CBU: 0000000000000000000000\nAlias: EMPRESA.PAGO\nMercado Pago: @miempresa"}
            className="resize-none h-24 text-sm font-mono"
            value={configForm.datos_pago}
            onChange={e => setConfigForm(p => ({ ...p, datos_pago: e.target.value }))}
          />
        </div>
      </div>

      {/* ── Certificado digital ── */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Key className="h-4 w-4" />Certificado digital</h3>
        <p className="text-xs text-muted-foreground">
          El certificado .pem y la clave privada se obtienen al dar de alta el servicio en el portal de ARCA.
          Consulta la pestana "Como tramitar el certificado" para instrucciones detalladas.
        </p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Certificado (.pem)</Label>
            <Textarea
              placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
              className="font-mono text-xs h-28 resize-none"
              value={configForm.cert_pem}
              onChange={e => setConfigForm(p => ({ ...p, cert_pem: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Clave privada (.pem)</Label>
            <Textarea
              placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
              className="font-mono text-xs h-28 resize-none"
              value={configForm.clave_pem}
              onChange={e => setConfigForm(p => ({ ...p, clave_pem: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* ── Opciones de visualizacion ── */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Settings className="h-4 w-4" />Opciones de visualizacion</h3>
          <p className="text-xs text-muted-foreground mt-1">Elegi que secciones aparecen en el PDF de cada factura por defecto.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([
            { key: "mostrar_logo",           label: "Logo de la empresa" },
            { key: "mostrar_domicilio",       label: "Domicilio fiscal" },
            { key: "mostrar_datos_contacto",  label: "Telefono y email" },
            { key: "mostrar_redes",           label: "Redes sociales" },
            { key: "mostrar_datos_pago",      label: "Datos de pago" },
            { key: "mostrar_nota",            label: "Nota al pie" },
          ] as { key: keyof typeof configForm.factura_opciones; label: string }[]).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer group">
              <button
                role="checkbox"
                aria-checked={configForm.factura_opciones[key]}
                onClick={() => setConfigForm(p => ({
                  ...p,
                  factura_opciones: { ...p.factura_opciones, [key]: !p.factura_opciones[key] }
                }))}
                className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  configForm.factura_opciones[key]
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-border bg-transparent group-hover:border-muted-foreground"
                }`}
              >
                {configForm.factura_opciones[key] && <CheckCircle2 className="h-3 w-3 text-white" />}
              </button>
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {configMsg && (
        <div className={`rounded-lg border p-3 text-sm flex items-center gap-2 ${configMsg.type === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
          {configMsg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
          {configMsg.text}
        </div>
      )}

      <Button onClick={saveConfig} disabled={savingConfig} className="gap-2">
        {savingConfig ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
        {savingConfig ? "Guardando..." : "Guardar configuracion"}
      </Button>
    </div>
  )
}
