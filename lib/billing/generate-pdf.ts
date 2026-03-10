/**
 * Genera un PDF a partir de HTML usando puppeteer-core + chromium-min.
 * Diseñado para Vercel serverless (no usa el binario nativo de Chrome).
 *
 * Variables de entorno:
 *   CHROMIUM_EXECUTABLE_PATH  – ruta directa al binario de Chromium (prioridad máxima)
 *   CHROMIUM_REMOTE_URL       – URL del pack .tar de chromium-min para descargar en runtime
 *                               Ejemplo: https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.tar
 *
 * En desarrollo local también funciona si hay Chrome/Chromium instalado en el sistema.
 */

let puppeteerCore: any = null
let chromiumMod:   any = null

async function lazyLoad() {
  if (!puppeteerCore) puppeteerCore = (await import("puppeteer-core")).default
  if (!chromiumMod)   chromiumMod   = (await import("@sparticuz/chromium-min")).default
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  await lazyLoad()

  let executablePath: string

  if (process.env.CHROMIUM_EXECUTABLE_PATH) {
    // Ruta explícita configurada en env vars (p.ej. Vercel → Settings → Environment Variables)
    executablePath = process.env.CHROMIUM_EXECUTABLE_PATH
  } else if (process.env.NODE_ENV !== "production") {
    // Desarrollo local: intentar Chrome/Chromium del sistema
    const fs = await import("fs")
    const localPaths = ["/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/chromium"]
    const found = localPaths.find(p => { try { return fs.existsSync(p) } catch { return false } })
    if (found) {
      executablePath = found
    } else {
      const remoteUrl = process.env.CHROMIUM_REMOTE_URL
      executablePath = remoteUrl
        ? await chromiumMod.executablePath(remoteUrl)
        : await chromiumMod.executablePath()
    }
  } else {
    // Producción (Vercel): descargar binario desde URL remota al arrancar la función
    // Configurá CHROMIUM_REMOTE_URL en Vercel → Project → Settings → Environment Variables
    // URL de ejemplo: https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.tar
    const remoteUrl = process.env.CHROMIUM_REMOTE_URL
    executablePath = remoteUrl
      ? await chromiumMod.executablePath(remoteUrl)
      : await chromiumMod.executablePath()
  }

  const browser = await puppeteerCore.launch({
    args:            chromiumMod.args,
    defaultViewport: chromiumMod.defaultViewport,
    executablePath,
    headless:        true,
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: "networkidle0" })
    const pdf = await page.pdf({
      format:          "A4",
      printBackground: true,
      margin:          { top: "0", right: "0", bottom: "0", left: "0" },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
