import type React from "react"
import type { Metadata } from "next"
import { Suspense } from "react"
import { MigrationProvider } from "@/components/migration-provider"
import { Toaster } from "@/components/ui/toaster"
import { ConditionalSidebar } from "@/components/conditional-sidebar"
import "./globals.css"

export const metadata: Metadata = {
  title: "Ecommerce Manager - SaaS",
  description: "Gestiona tu ecommerce con integraciones de Mercado Libre y Shopify",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="dark">
      <body className="font-sans antialiased">
        <MigrationProvider>
          <div className="flex min-h-screen">
            <ConditionalSidebar />
            <main className="flex-1">
              <Suspense fallback={null}>{children}</Suspense>
            </main>
          </div>
        </MigrationProvider>
        <Toaster />
      </body>
    </html>
  )
}
