"use client"

import React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function ImportCSVPage() {
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  
  useEffect(() => {
    fetchAccounts()
  }, [])
  
  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/ml/accounts')
      if (response.ok) {
        const data = await response.json()
        setAccounts(data.accounts || [])
        if (data.accounts?.length > 0) {
          setSelectedAccount(data.accounts[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching accounts:', error)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setProcessing(true)
    setResult("Leyendo archivo...")

    try {
      const text = await file.text()
      const lines = text.split('\n')
      
      // Parsear CSV
      const headers = lines[0].split(';')
      const csvData = []
      
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue
        
        const values = lines[i].split(';')
        const row: any = {}
        
        headers.forEach((header, index) => {
          row[header.trim()] = values[index]?.trim() || ''
        })
        
        csvData.push(row)
      }
      
      setResult(`Archivo leído: ${csvData.length} filas. Procesando...`)
      
      if (!selectedAccount) {
        setResult('Error: Debes seleccionar una cuenta primero')
        setProcessing(false)
        return
      }
      
      // Enviar a API
      const response = await fetch('/api/ml/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          csvData,
          account_id: selectedAccount
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setResult(`✓ Importación completada:
        - ${data.processed} publicaciones procesadas
        - ${data.linked} vinculadas con productos
        - ${data.notLinked} sin vincular
        - ${data.errors} errores`)
      } else {
        setResult('Error al procesar CSV')
      }
      
    } catch (error) {
      console.error('Error:', error)
      setResult('Error al leer archivo')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Importar Publicaciones desde CSV</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Cuenta de MercadoLibre</label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.nickname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <p className="text-sm text-muted-foreground">
              Sube el archivo CSV exportado desde MercadoLibre con las columnas: ITEM_ID, SKU, TITLE, QUANTITY
            </p>
            
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={processing}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
            
            {result && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
                <pre className="text-sm whitespace-pre-wrap">{result}</pre>
              </div>
            )}
            
            {processing && (
              <p className="text-sm text-muted-foreground">Procesando...</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
