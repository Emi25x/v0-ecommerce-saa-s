// Configuración global de la aplicación

// URL base para llamadas internas
export function getBaseUrl(): string {
  const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`
  }
  return "http://localhost:3000"
}

export const baseUrl = getBaseUrl()
