"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Search, RefreshCw } from "lucide-react"
import type { VerificationResult } from "@/components/inventory/types"

interface SkuVerifierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  skuToVerify: string
  onSkuChange: (value: string) => void
  verificationResult: VerificationResult | null
  verifying: boolean
  onVerify: (sku: string) => void
  onViewProduct: (sku: string) => void
}

export function SkuVerifierDialog({
  open,
  onOpenChange,
  skuToVerify,
  onSkuChange,
  verificationResult,
  verifying,
  onVerify,
  onViewProduct,
}: SkuVerifierDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verificar SKU en Base de Datos</DialogTitle>
          <DialogDescription>
            Ingresa un SKU para verificar si existe en la base de datos y ver su informaci&oacute;n
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Ingresa el SKU a verificar (ej: 9788466739894)"
              value={skuToVerify}
              onChange={(e) => onSkuChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onVerify(skuToVerify)
                }
              }}
              className="flex-1"
            />
            <Button onClick={() => onVerify(skuToVerify)} disabled={verifying}>
              {verifying ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Verificar
                </>
              )}
            </Button>
          </div>

          {verificationResult && (
            <div className="space-y-4 border-t pt-4">
              <div
                className={`p-4 rounded-lg border-2 ${
                  verificationResult.found
                    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                }`}
              >
                <p
                  className={`font-semibold ${
                    verificationResult.found ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"
                  }`}
                >
                  {verificationResult.message}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Total de productos en la base de datos: {verificationResult.totalProductsInDB}
                </p>
              </div>

              {verificationResult.exactMatch && (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <h3 className="font-semibold mb-3">Informaci&oacute;n del Producto:</h3>
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-muted-foreground">SKU:</span>
                        <p className="font-mono font-semibold">{verificationResult.exactMatch.sku}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">C&oacute;digo Interno:</span>
                        <p className="font-mono">{verificationResult.exactMatch.internal_code || "N/A"}</p>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">T&iacute;tulo:</span>
                      <p className="font-medium">{verificationResult.exactMatch.title || "N/A"}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <span className="text-muted-foreground">Precio:</span>
                        <p className="font-mono">${verificationResult.exactMatch.price?.toFixed(2) || "N/A"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Stock:</span>
                        <p>{verificationResult.exactMatch.stock ?? "N/A"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Condici&oacute;n:</span>
                        <p>{verificationResult.exactMatch.condition || "N/A"}</p>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fuentes:</span>
                      {verificationResult.exactMatch.source &&
                      Array.isArray(verificationResult.exactMatch.source) &&
                      verificationResult.exactMatch.source.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {verificationResult.exactMatch.source.map((src: string, idx: number) => (
                            <Badge key={idx} variant="secondary">
                              {src}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm">Sin fuentes</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-muted-foreground">Creado:</span>
                        <p className="text-xs">
                          {verificationResult.exactMatch.created_at
                            ? new Date(verificationResult.exactMatch.created_at).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Actualizado:</span>
                        <p className="text-xs">
                          {verificationResult.exactMatch.updated_at
                            ? new Date(verificationResult.exactMatch.updated_at).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {verificationResult.similarMatches && verificationResult.similarMatches.length > 0 && (
                <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-950/20">
                  <h3 className="font-semibold mb-3 text-yellow-800 dark:text-yellow-200">
                    Productos con SKU Similar ({verificationResult.similarMatches.length}):
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {verificationResult.similarMatches.map((product: any, idx: number) => (
                      <div key={idx} className="border rounded p-2 bg-background">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-mono text-sm font-semibold">{product.sku}</p>
                            <p className="text-xs text-muted-foreground truncate">{product.title}</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => onViewProduct(product.sku)}>
                            Ver
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
