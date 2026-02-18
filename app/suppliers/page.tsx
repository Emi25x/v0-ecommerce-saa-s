"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Upload, Package, FileText, CheckCircle, XCircle, Clock, TrendingUp, Settings } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [catalogs, setCatalogs] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchSuppliers()
    fetchWarehouses()
  }, [])
  
  const fetchWarehouses = async () => {
    try {
      const res = await fetch("/api/warehouses")
      const data = await res.json()
      setWarehouses(data.warehouses || [])
      
      // Set default warehouse if exists
      const defaultWarehouse = data.warehouses?.find((w: any) => w.is_default)
      if (defaultWarehouse) {
        setSelectedWarehouse(defaultWarehouse.id)
      }
    } catch (error) {
      console.error("Error fetching warehouses:", error)
    }
  }

  useEffect(() => {
    if (selectedSupplier) {
      fetchCatalogs()
    }
  }, [selectedSupplier])

  const fetchSuppliers = async () => {
    try {
      const res = await fetch("/api/suppliers")
      const data = await res.json()
      setSuppliers(data.suppliers || [])
      
      if (data.suppliers?.length > 0 && !selectedSupplier) {
        setSelectedSupplier(data.suppliers[0].id)
      }
    } catch (error) {
      console.error("Error fetching suppliers:", error)
    }
  }

  const fetchCatalogs = async () => {
    if (!selectedSupplier) return

    try {
      const res = await fetch(`/api/suppliers/catalogs?supplier_id=${selectedSupplier}`)
      const data = await res.json()
      setCatalogs(data.catalogs || [])
    } catch (error) {
      console.error("Error fetching catalogs:", error)
    }
  }

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedSupplier) return

    setLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.append("supplier_id", selectedSupplier)

    try {
      const res = await fetch("/api/suppliers/catalogs", {
        method: "POST",
        body: formData
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      toast({
        title: "Catálogo subido",
        description: "El catálogo se subió correctamente. Ahora puedes importarlo."
      })

      setUploadDialogOpen(false)
      fetchCatalogs()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async (catalogId: string) => {
    if (!selectedWarehouse && warehouses.length > 0) {
      toast({
        title: "Selecciona un almacén",
        description: "Debes seleccionar un almacén antes de importar",
        variant: "destructive"
      })
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`/api/suppliers/catalogs/${catalogId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouse_id: selectedWarehouse })
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      toast({
        title: "Importación completada",
        description: `${data.total_items} items procesados, ${data.matched_items} vinculados (${data.match_rate}%)${data.created_products ? `, ${data.created_products} productos creados` : ''}`
      })

      fetchCatalogs()
    } catch (error: any) {
      toast({
        title: "Error en importación",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const selectedSupplierData = suppliers.find(s => s.id === selectedSupplier)

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Gestión de Proveedores</h1>
        <p className="text-muted-foreground">
          Importa y gestiona catálogos de precios de proveedores como Azeta
        </p>
      </div>

      {/* Supplier Selection */}
      <Card className="p-4 mb-6">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium">Proveedor:</Label>
            <div className="flex gap-2">
              {suppliers.map((supplier) => (
                <Button
                  key={supplier.id}
                  variant={selectedSupplier === supplier.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSupplier(supplier.id)}
                >
                  <Package className="mr-2 h-4 w-4" />
                  {supplier.name}
                  {supplier.code && (
                    <Badge variant="secondary" className="ml-2">
                      {supplier.code}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
          </div>
          
          {warehouses.length > 0 && (
            <div className="flex items-center gap-4">
              <Label className="text-sm font-medium">Almacén:</Label>
              <div className="flex gap-2 flex-wrap">
                {warehouses.map((warehouse) => (
                  <Button
                    key={warehouse.id}
                    variant={selectedWarehouse === warehouse.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedWarehouse(warehouse.id)}
                  >
                    {warehouse.name}
                    <Badge variant="secondary" className="ml-2">
                      {warehouse.code}
                    </Badge>
                    {warehouse.is_default && (
                      <span className="ml-1 text-xs">(defecto)</span>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Stats Cards */}
      {selectedSupplierData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Catálogos</p>
                <p className="text-2xl font-bold">{catalogs.length}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Items Totales</p>
                <p className="text-2xl font-bold">
                  {catalogs.reduce((sum, c) => sum + (c.total_items || 0), 0).toLocaleString()}
                </p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Items Vinculados</p>
                <p className="text-2xl font-bold text-green-600">
                  {catalogs.reduce((sum, c) => sum + (c.matched_items || 0), 0).toLocaleString()}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tasa de Vinculación</p>
                <p className="text-2xl font-bold text-blue-600">
                  {catalogs.length > 0
                    ? (
                        (catalogs.reduce((sum, c) => sum + (c.matched_items || 0), 0) /
                          Math.max(catalogs.reduce((sum, c) => sum + (c.total_items || 0), 0), 1)) *
                        100
                      ).toFixed(1)
                    : "0"}
                  %
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
          </Card>
        </div>
      )}

      {/* Catalogs List */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Catálogos</h2>
          
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!selectedSupplier}>
                <Upload className="mr-2 h-4 w-4" />
                Subir Catálogo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Subir Catálogo de Precios</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nombre del catálogo</Label>
                  <Input id="name" name="name" placeholder="Ej: Lista de Precios Marzo 2026" required />
                </div>
                <div>
                  <Label htmlFor="description">Descripción (opcional)</Label>
                  <Input id="description" name="description" placeholder="Detalles adicionales..." />
                </div>
                <div>
                  <Label htmlFor="file">Archivo CSV/XLSX</Label>
                  <Input id="file" name="file" type="file" accept=".csv,.xlsx,.xls" required />
                  <p className="text-xs text-muted-foreground mt-1">
                    El archivo debe tener columnas: ISBN, Titulo, Precio, Stock
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? "Subiendo..." : "Subir"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setUploadDialogOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Vinculados</TableHead>
              <TableHead>Tasa</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No hay catálogos. Sube tu primer catálogo para comenzar.
                </TableCell>
              </TableRow>
            ) : (
              catalogs.map((catalog) => (
                <TableRow key={catalog.id}>
                  <TableCell className="font-medium">{catalog.name}</TableCell>
                  <TableCell>
                    {catalog.import_status === "completed" && (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Completado
                      </Badge>
                    )}
                    {catalog.import_status === "pending" && (
                      <Badge variant="secondary">
                        <Clock className="mr-1 h-3 w-3" />
                        Pendiente
                      </Badge>
                    )}
                    {catalog.import_status === "processing" && (
                      <Badge variant="default">
                        <Clock className="mr-1 h-3 w-3" />
                        Procesando
                      </Badge>
                    )}
                    {catalog.import_status === "failed" && (
                      <Badge variant="destructive">
                        <XCircle className="mr-1 h-3 w-3" />
                        Error
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{catalog.total_items?.toLocaleString() || 0}</TableCell>
                  <TableCell className="text-green-600 font-medium">
                    {catalog.matched_items?.toLocaleString() || 0}
                  </TableCell>
                  <TableCell>
                    {catalog.total_items > 0
                      ? ((catalog.matched_items / catalog.total_items) * 100).toFixed(1)
                      : "0"}
                    %
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {catalog.created_at
                      ? new Date(catalog.created_at).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {catalog.import_status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() => handleImport(catalog.id)}
                          disabled={loading}
                        >
                          Importar
                        </Button>
                      )}
                      {catalog.import_status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleImport(catalog.id)}
                          disabled={loading}
                        >
                          Reintentar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.location.href = `/suppliers/catalogs/${catalog.id}/settings`}
                        title="Configuración"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
