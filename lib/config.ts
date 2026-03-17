// Configuración global de la aplicación

// URL base para llamadas internas
export function getBaseUrl(): string {
  // Prefer explicit app URL (custom domain)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  // Vercel auto-injected deployment URL
  const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`
  }

  // Only allow localhost in development — fail-fast in production
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing NEXT_PUBLIC_APP_URL or VERCEL_URL. " +
      "Cannot construct base URL in production without an explicit URL env var.",
    )
  }

  return "http://localhost:3000"
}

export const baseUrl = getBaseUrl()
