"use client"

import { ShieldCheck, Key, Globe, ExternalLink, Terminal } from "lucide-react"

export function HelpTab() {
  return (
    <div className="max-w-3xl space-y-6">

      {/* Intro */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-6 w-6 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-base mb-1">Certificado digital para facturaci&oacute;n electr&oacute;nica ARCA</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Para emitir facturas electr&oacute;nicas necesit&aacute;s un certificado digital que identifica a tu software ante los servidores de ARCA (ex-AFIP).
              El proceso es gratuito y se realiza 100% online desde el portal de ARCA con tu CUIT y Clave Fiscal nivel 3.
            </p>
          </div>
        </div>
      </div>

      {/* Paso 1 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm flex-shrink-0">1</span>
          <h3 className="font-semibold">Verificar Clave Fiscal nivel 3</h3>
        </div>
        <div className="px-5 py-4 space-y-2 text-sm text-muted-foreground leading-relaxed">
          <p>Ingres&aacute; al portal de ARCA con tu CUIT y Clave Fiscal. Necesit&aacute;s <strong className="text-foreground">nivel 3 como m&iacute;nimo</strong> para administrar los webservices.</p>
          <p>Si ten&eacute;s nivel 2 o menos, deb&eacute;s acercarte a una oficina de ARCA con tu DNI para elevar el nivel.</p>
          <a
            href="https://auth.afip.gob.ar/contribuyente_/login.xhtml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium mt-1"
          >
            <Globe className="h-3.5 w-3.5" />
            Ir al portal de ARCA
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Paso 2 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm flex-shrink-0">2</span>
          <h3 className="font-semibold">Generar la clave privada y el CSR (Certificate Signing Request)</h3>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>Desde tu computadora (no desde el portal), ejecut&aacute; los siguientes comandos con <strong className="text-foreground">OpenSSL</strong> instalado:</p>

          <div className="rounded-md bg-black/40 border border-border p-4 font-mono text-xs space-y-1">
            <p className="text-muted-foreground"># 1. Generar la clave privada (2048 bits)</p>
            <p className="text-emerald-400">openssl genrsa -out private_key.pem 2048</p>
            <p className="text-muted-foreground mt-2"># 2. Generar el CSR (reemplaz&aacute; los datos con los tuyos)</p>
            <p className="text-emerald-400">openssl req -new -key private_key.pem -out cert_request.csr \</p>
            <p className="text-emerald-400 pl-4">{'-subj "/C=AR/O=TU_RAZON_SOCIAL/CN=TU_CUIT/serialNumber=CUIT TU_CUIT"'}</p>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-400 flex items-start gap-2">
            <Key className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Guard&aacute; el archivo <code className="font-mono text-xs bg-black/30 px-1 rounded">private_key.pem</code> en un lugar seguro. Nunca lo compartas ni lo subas al portal. Solo el CSR va a ARCA.</span>
          </div>

          <p>Si no ten&eacute;s OpenSSL, pod&eacute;s instalarlo en Windows desde <strong className="text-foreground">winget install ShiningLight.OpenSSL</strong> o descargarlo desde slproweb.com/products/Win32OpenSSL.html</p>
        </div>
      </div>

      {/* Paso 3 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm flex-shrink-0">3</span>
          <h3 className="font-semibold">Subir el CSR a ARCA y obtener el certificado</h3>
        </div>
        <div className="px-5 py-4 space-y-2 text-sm text-muted-foreground leading-relaxed">
          <p>Con tu Clave Fiscal en el portal de ARCA:</p>
          <ol className="space-y-2 ml-4 list-decimal marker:text-foreground">
            <li>Ir a <strong className="text-foreground">Administrador de Relaciones de Clave Fiscal</strong></li>
            <li>Seleccionar tu CUIT en el panel izquierdo</li>
            <li>Click en <strong className="text-foreground">{'"'}Nueva Relaci&oacute;n{'"'}</strong></li>
            <li>Buscar y seleccionar el servicio <strong className="text-foreground">{'"'}WSFE {'\u2014'} Facturaci&oacute;n Electr&oacute;nica{'"'}</strong></li>
            <li>En la misma secci&oacute;n, ir a <strong className="text-foreground">{'"'}Administraci&oacute;n de Certificados Digitales{'"'}</strong></li>
            <li>Click en <strong className="text-foreground">{'"'}Agregar Alias{'"'}</strong> {'\u2192'} ponerle un nombre (ej: {'"'}MiSistema{'"'})</li>
            <li>Subir el archivo <code className="font-mono text-xs bg-black/30 px-1 rounded">cert_request.csr</code> generado en el paso anterior</li>
            <li>ARCA te devuelve un archivo <code className="font-mono text-xs bg-black/30 px-1 rounded">certificado.crt</code> {'\u2014'} descargarlo</li>
          </ol>
        </div>
      </div>

      {/* Paso 4 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm flex-shrink-0">4</span>
          <h3 className="font-semibold">Dar de alta el punto de venta</h3>
        </div>
        <div className="px-5 py-4 space-y-2 text-sm text-muted-foreground leading-relaxed">
          <p>En el portal de ARCA, ir a <strong className="text-foreground">{'"'}Administraci&oacute;n de Puntos de Venta y Domicilios{'"'}</strong>:</p>
          <ol className="space-y-2 ml-4 list-decimal marker:text-foreground">
            <li>Click en <strong className="text-foreground">{'"'}Alta de Punto de Venta{'"'}</strong></li>
            <li>Elegir un n&uacute;mero (ej: <code className="font-mono text-xs bg-black/30 px-1 rounded">2</code>) {'\u2014'} el 1 suele estar reservado para RECE online</li>
            <li>Seleccionar el sistema: <strong className="text-foreground">{'"'}Facturaci&oacute;n Electr&oacute;nica {'\u2014'} WebService{'"'}</strong></li>
            <li>Asignar un domicilio y confirmar</li>
          </ol>
          <p className="mt-1">El n&uacute;mero elegido es el que deb&eacute;s ingresar en la secci&oacute;n <strong className="text-foreground">Configuraci&oacute;n ARCA</strong> de esta app.</p>
        </div>
      </div>

      {/* Paso 5 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm flex-shrink-0">5</span>
          <h3 className="font-semibold">Cargar los datos en esta app</h3>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>Ir a la pesta&ntilde;a <strong className="text-foreground">Configuraci&oacute;n ARCA</strong> y completar:</p>
          <div className="grid gap-2">
            <div className="flex items-start gap-2">
              <span className="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded text-foreground mt-0.5">CUIT</span>
              <span>Tu CUIT sin guiones (ej: 20123456789)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded text-foreground mt-0.5">Punto de venta</span>
              <span>El n&uacute;mero dado de alta en el paso anterior</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded text-foreground mt-0.5">Certificado PEM</span>
              <span>El contenido del archivo <code className="font-mono text-xs bg-black/30 px-1 rounded">certificado.crt</code> que devolvi&oacute; ARCA (texto completo, incluido el encabezado <code className="font-mono text-xs bg-black/30 px-1 rounded">-----BEGIN CERTIFICATE-----</code>)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded text-foreground mt-0.5">Clave privada</span>
              <span>El contenido del archivo <code className="font-mono text-xs bg-black/30 px-1 rounded">private_key.pem</code> generado en el paso 2</span>
            </div>
          </div>
          <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-blue-300 flex items-start gap-2 mt-2">
            <Terminal className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Empez&aacute; siempre en <strong>ambiente Homologaci&oacute;n</strong> (testing) para probar que todo funciona antes de pasar a Producci&oacute;n. Los CAE de homologaci&oacute;n no son v&aacute;lidos fiscalmente.</span>
          </div>
        </div>
      </div>

      {/* Normativa vigente */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-amber-500/20">
          <ShieldCheck className="h-5 w-5 text-amber-400 flex-shrink-0" />
          <h3 className="font-semibold">Normativa vigente {'\u2014'} {'\u00BF'}cu&aacute;ndo identificar al receptor?</h3>
        </div>
        <div className="px-5 py-4 space-y-4 text-sm text-muted-foreground leading-relaxed">

          <div className="rounded-md border border-border bg-card p-4 space-y-2">
            <p className="font-semibold text-foreground">R&eacute;gimen General (Responsable Inscripto / Factura B)</p>
            <p>Seg&uacute;n la <strong className="text-amber-400">RG ARCA 5700/2025</strong> (vigente desde el 29 de mayo de 2025), la identificaci&oacute;n del Consumidor Final es obligatoria cuando el total del comprobante supera:</p>
            <div className="rounded bg-black/30 p-3 font-mono text-xs space-y-1">
              <p><span className="text-emerald-400">{'>'} $10.000.000</span> {'\u2192'} <span className="text-foreground">Identificaci&oacute;n OBLIGATORIA (CUIT / CUIL / CDI / DNI)</span></p>
              <p><span className="text-blue-400">{'\u2264'} $10.000.000</span> {'\u2192'} <span className="text-foreground">Sin identificaci&oacute;n (DocTipo 99, DocNro 0)</span></p>
            </div>
            <p>Al superar el l&iacute;mite, solo es necesario el n&uacute;mero de documento. Ya <strong className="text-foreground">no es obligatorio</strong> incluir nombre ni domicilio.</p>
          </div>

          <div className="rounded-md border border-border bg-card p-4 space-y-2">
            <p className="font-semibold text-foreground">Monotributistas (Factura C)</p>
            <p>El l&iacute;mite para no identificar al receptor en Factura C es <strong className="text-foreground">$10.000.000</strong> (mismo criterio desde RG 5700/2025).</p>
            <p>Para usar la herramienta {'"'}Facturador{'"'} de ARCA el tope es <strong className="text-foreground">$500.000</strong> (no aplica a integraciones por webservice como esta app).</p>
          </div>

          <div className="rounded-md border border-border bg-card p-4 space-y-2">
            <p className="font-semibold text-foreground">Responsable Inscripto a Responsable Inscripto (Factura A)</p>
            <p>La Factura A siempre requiere el <strong className="text-foreground">CUIT del receptor</strong> (DocTipo 80) sin excepci&oacute;n. No existe l&iacute;mite de monto ni opci&oacute;n de emitir sin identificar.</p>
          </div>

          <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-blue-300 text-xs">
            Los montos se actualizan cada semestre (enero y julio) tomando el {'\u00CD'}ndice de Precios al Consumidor (IPC) del INDEC. Esta app mostrar&aacute; una advertencia autom&aacute;tica cuando el total de la factura supere el umbral vigente.
          </div>
        </div>
      </div>

      {/* Links utiles */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><ExternalLink className="h-4 w-4 text-muted-foreground" />Links oficiales</h3>
        <div className="space-y-2 text-sm">
          {[
            { label: "Portal ARCA (Clave Fiscal)", href: "https://auth.afip.gob.ar/contribuyente_/login.xhtml" },
            { label: "RG ARCA 5700/2025 \u2014 Identificaci\u00F3n Consumidor Final", href: "https://biblioteca.afip.gob.ar/search/query/norma.aspx?p=t%3ARAG%7Cn%3A5700" },
            { label: "RG ARCA 5616 \u2014 CondicionIVAReceptor (obligatoria)", href: "https://biblioteca.afip.gob.ar/search/query/norma.aspx?p=t%3ARAG%7Cn%3A5616" },
            { label: "Manual WSFE v1 \u2014 ARCA", href: "https://www.afip.gob.ar/ws/documentacion/manual_desarrollador_wsfev1.pdf" },
            { label: "OpenSSL para Windows", href: "https://slproweb.com/products/Win32OpenSSL.html" },
            { label: "Gu\u00EDa de Factura Electr\u00F3nica ARCA", href: "https://www.afip.gob.ar/fe/ayuda/documentos/manual-factura-electronica.pdf" },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
              {label}
            </a>
          ))}
        </div>
      </div>

    </div>
  )
}
