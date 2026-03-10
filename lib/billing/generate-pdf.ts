/**
 * Genera un PDF a partir de HTML usando puppeteer-core + chromium-min.
 * Diseñado para Vercel serverless (no usa el binario nativo de Chrome).
 *
 * En desarrollo local también funciona si hay Chrome/Chromium instalado.
 */

let puppeteerCore: any = null
let chromiumMod:   any = null

async function lazyLoad() {
  if (!puppeteerCore) puppeteerCore = (await import("puppeteer-core")).default
  if (!chromiumMod)   chromiumMod   = (await import("@sparticuz/chromium-min")).default
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  await lazyLoad()

  // En local podemos usar el Chrome instalado del sistema
  const isLocal      = process.env.NODE_ENV !== "production"
  const localChrome  = "/usr/bin/chromium-browser"
  const localChrome2 = "/usr/bin/google-chrome"
  const localChrome3 = "/usr/bin/chromium"

  let executablePath: string
  if (isLocal) {
    const fs = await import("fs")
    executablePath = [localChrome, localChrome2, localChrome3].find(p => {
      try { return fs.existsSync(p) } catch { return false }
    }) || await chromiumMod.executablePath()
  } else {
    executablePath = await chromiumMod.executablePath()
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
      format:              "A4",
      printBackground:     true,
      margin:              { top: "0", right: "0", bottom: "0", left: "0" },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
