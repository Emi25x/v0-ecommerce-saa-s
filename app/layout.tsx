import type React from "react"
import type { Metadata, Viewport } from "next"
import { ThemeProvider } from "@/components/layout/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Nexo Commerce",
    template: "%s | Nexo Commerce",
  },
  description: "Plataforma de gestión e-commerce multi-canal. Inventario, pedidos, envíos y facturación en un solo lugar.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <div className="flex min-h-dvh">{children}</div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
