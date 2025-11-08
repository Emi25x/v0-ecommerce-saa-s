"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

const Eye = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
)

const EyeOff = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
    />
  </svg>
)

interface LibralConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function LibralConfigDialog({ open, onOpenChange, onSuccess }: LibralConfigDialogProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTesting(true)
    setError(null)
    setSuccess(false)

    const cleanUsername = username.trim().replace(/^["']|["']$/g, "")
    const cleanPassword = password.trim().replace(/^["']|["']$/g, "")

    console.log("[v0] Libral Config - Attempting to save credentials for user:", cleanUsername)

    try {
      // Save credentials
      const saveResponse = await fetch("/api/integrations/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integration: "libral",
          credentials: { username: cleanUsername, password: cleanPassword },
        }),
      })

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json()
        console.error("[v0] Libral Config - Failed to save credentials:", errorData)
        throw new Error(errorData.error || "Failed to save credentials")
      }

      console.log("[v0] Libral Config - Credentials saved, testing connection...")

      // Test connection
      const testResponse = await fetch("/api/libral/test-connection")
      const testData = await testResponse.json()

      console.log("[v0] Libral Config - Test response:", testData)

      if (testData.connected) {
        setSuccess(true)
        console.log("[v0] Libral Config - Connection successful, installing as import source...")
        // Auto-install as import source
        await fetch("/api/setup/libral", { method: "POST" })
        setTimeout(() => {
          onSuccess()
          onOpenChange(false)
        }, 1500)
      } else {
        setError(testData.error || "Failed to connect to Libral")
      }
    } catch (err) {
      console.error("[v0] Libral Config - Error:", err)
      setError(err instanceof Error ? err.message : "Failed to configure Libral")
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar Libral ERP</DialogTitle>
          <DialogDescription>Ingresa tus credenciales de Libral para conectar tu ERP</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuario</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="SHOPIFY"
              required
              disabled={testing || success}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={testing || success}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-gray-700 hover:text-gray-900"
                onClick={() => setShowPassword(!showPassword)}
                disabled={testing || success}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-500/50 bg-green-500/10">
              <AlertDescription className="text-green-500">
                Conexión exitosa. Libral configurado correctamente.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={testing || success}>
              Cancelar
            </Button>
            <Button type="submit" disabled={testing || success} className="flex-1">
              {testing ? "Probando conexión..." : success ? "Conectado" : "Conectar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
