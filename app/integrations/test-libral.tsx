"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function TestLibralAuth() {
  const [username, setUsername] = useState("LIBRAL_APP")
  const [password, setPassword] = useState("JH7kl%64321")
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<any>(null)

  const handleTest = async () => {
    setTesting(true)
    setResults(null)

    try {
      const response = await fetch("/api/libral/test-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()
      setResults(data)
    } catch (error: any) {
      setResults({ error: error.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnóstico de Autenticación Libral</CardTitle>
        <CardDescription>Prueba diferentes configuraciones de la petición</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="test-username">Usuario</Label>
          <Input
            id="test-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="LIBRAL_APP"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="test-password">Contraseña</Label>
          <Input
            id="test-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
          />
        </div>

        <Button onClick={handleTest} disabled={testing}>
          {testing ? "Probando..." : "Probar Autenticación"}
        </Button>

        {results && (
          <div className="mt-4 space-y-4">
            <h3 className="font-semibold">Resultados:</h3>
            <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">{JSON.stringify(results, null, 2)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
