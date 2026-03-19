"use client"

import MLCatalogMigrationPage from "@/app/(dashboard)/ml/catalog/page"

// Wrapper — reutiliza la UI existente de /ml/catalog (opt-in y migración)
export default function MLCatalogOptinPage() {
  return <MLCatalogMigrationPage />
}
