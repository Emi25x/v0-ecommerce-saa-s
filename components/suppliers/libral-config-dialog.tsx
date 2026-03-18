"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff } from "lucide-react"

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
