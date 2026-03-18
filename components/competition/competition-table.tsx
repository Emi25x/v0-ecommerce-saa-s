"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import type { Product, PagingInfo } from "@/components/competition/types"
import {
  getCompetitionIcon,
  getCompetitionStatusColor,
  getCompetitionStatusText,
  getCompetitionExplanation,
  getBoostIcon,
  getBoostText,
} from "@/components/competition/utils"

interface CompetitionTableProps {
  loading: boolean
  filteredProducts: Product[]
  mlPaging: PagingInfo
  totalPages: number
  currentPage: number
  setCurrentPage: (updater: (p: number) => number) => void
  selectedProducts: Set<string>
  bulkUpdating: boolean
  analyzingId: string | null
  expandedRows: Set<string>
  applyingBoost: string | null
  priceUpdateValue: { [key: string]: string }
  setPriceUpdateValue: (value: { [key: string]: string }) => void
  priceTrackings: { [key: string]: any }
  loadProducts: () => Promise<void>
  analyzeCompetition: (itemId: string) => Promise<void>
  analyzeAllVisible: () => Promise<void>
  toggleRowExpansion: (productId: string) => void
  toggleSelectAll: () => void
  toggleSelectProduct: (productId: string) => void
  bulkUpdateToPriceToWin: () => Promise<void>
  applyPriceChange: (itemId: string, newPrice: number) => Promise<void>
  applyShippingBoost: (itemId: string, boostType: string) => Promise<void>
  openEditModal: (product: Product) => void
  openTrackingModal: (product: Product) => void
}

export function CompetitionTable({
  loading,
  filteredProducts,
  mlPaging,
  totalPages,
  currentPage,
  setCurrentPage,
  selectedProducts,
  bulkUpdating,
  analyzingId,
  expandedRows,
  applyingBoost,
  priceUpdateValue,
  setPriceUpdateValue,
  priceTrackings,
  loadProducts,
  analyzeCompetition,
  analyzeAllVisible,
  toggleRowExpansion,
  toggleSelectAll,
  toggleSelectProduct,
  bulkUpdateToPriceToWin,
  applyPriceChange,
  applyShippingBoost,
  openEditModal,
  openTrackingModal,
}: CompetitionTableProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Publicaciones con Análisis de Competencia</CardTitle>
            <CardDescription>
              {loading ? (
                "Cargando..."
              ) : (
                <>
                  Mostrando {filteredProducts.length} de {mlPaging.total.toLocaleString()} productos
                  {totalPages > 1 && ` (Página ${currentPage} de ${totalPages})`}
                </>
              )}
              {selectedProducts.size > 0 && (
                <span className="ml-2 text-blue-600 font-semibold">• {selectedProducts.size} seleccionados</span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {selectedProducts.size > 0 && (
              <Button
                onClick={bulkUpdateToPriceToWin}
                disabled={bulkUpdating}
                className="bg-green-600 hover:bg-green-700"
              >
                {bulkUpdating ? "Actualizando..." : `Igualar Precio (${selectedProducts.size})`}
              </Button>
            )}
            <Button onClick={loadProducts} disabled={loading} variant="outline">
              Actualizar Lista
            </Button>
            <Button onClick={analyzeAllVisible} disabled={loading || analyzingId !== null}>
              Analizar Todos
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[400px] items-center justify-center">Cargando productos...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex h-[400px] items-center justify-center">No hay productos disponibles.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Precio Actual</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Estado Competencia</TableHead>
                    <TableHead>Precio para Ganar</TableHead>
                    {/* Start of update */}
                    <TableHead>Mejor Precio Competidor</TableHead>
                    <TableHead>Vendedor Ganador</TableHead>
                    {/* End of update */}
                    <TableHead>Seguimiento Auto</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <>
                      <TableRow key={product.id} className="group">
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleSelectProduct(product.id)}
                            className="h-4 w-4 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell>
                          {product.competition && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleRowExpansion(product.id)}
                              className="h-8 w-8 p-0"
                            >
                              {expandedRows.has(product.id) ? "▼" : "▶"}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {product.image && (
                              <img
                                src={product.image || "/placeholder.svg"}
                                alt={product.title}
                                className="h-10 w-10 rounded object-cover"
                              />
                            )}
                            <div className="max-w-[300px]">
                              <p className="font-medium truncate">{product.title}</p>
                              <p className="text-xs text-muted-foreground">{product.id}</p>
                              {product.seller_sku && product.seller_sku !== "N/A" && (
                                <p className="text-xs text-muted-foreground">SKU: {product.seller_sku}</p>
                              )}
                              <Badge variant="outline" className="mt-1">
                                {product.account_nickname || "N/A"}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-lg">${product.price}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={product.inventory > 0 ? "default" : "secondary"}>{product.inventory}</Badge>
                        </TableCell>
                        <TableCell>
                          {product.competition ? (
                            <div className="space-y-1">
                              <Badge className={`${getCompetitionStatusColor(product.competition.status)} border`}>
                                {getCompetitionIcon(product.competition.status)}{" "}
                                {getCompetitionStatusText(product.competition.status)}
                              </Badge>
                              {product.competition.has_opportunities && (
                                <Badge
                                  variant="outline"
                                  className="ml-1 text-xs bg-yellow-50 text-yellow-700 border-yellow-300"
                                >
                                  ✨ Oportunidades
                                </Badge>
                              )}
                              <div className="text-xs text-muted-foreground mt-1">
                                Participación: <strong>{product.competition.visit_share}</strong>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No analizado</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.competition && product.competition.price_to_win !== null ? (
                            <div className="space-y-1">
                              <span className="font-semibold text-lg text-blue-600">
                                ${product.competition.price_to_win.toFixed(2)}
                              </span>
                              {product.competition.winner_price && (
                                <div className="text-xs text-muted-foreground">
                                  Ganador: ${product.competition.winner_price.toFixed(2)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        {/* Start of update */}
                        <TableCell>
                          {product.competition?.winner_price ? (
                            <div className="space-y-1">
                              <span className="font-semibold text-lg text-red-600">
                                ${product.competition.winner_price.toFixed(2)}
                              </span>
                              {product.price && (
                                <div className="text-xs text-muted-foreground">
                                  {Number.parseFloat(product.price) > product.competition.winner_price ? (
                                    <span className="text-red-600">
                                      +$
                                      {(Number.parseFloat(product.price) - product.competition.winner_price).toFixed(
                                        2,
                                      )}{" "}
                                      más caro
                                    </span>
                                  ) : Number.parseFloat(product.price) < product.competition.winner_price ? (
                                    <span className="text-green-600">
                                      -$
                                      {(product.competition.winner_price - Number.parseFloat(product.price)).toFixed(
                                        2,
                                      )}{" "}
                                      más barato
                                    </span>
                                  ) : (
                                    <span className="text-blue-600">Mismo precio</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.competition?.winner ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <span className="text-xl">🏆</span>
                                <span className="font-medium text-gray-900">
                                  {product.competition.winner.nickname}
                                </span>
                              </div>
                              {product.competition.winner.advantages &&
                                product.competition.winner.advantages.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {product.competition.winner.advantages.slice(0, 2).map((adv, idx) => (
                                      <Badge key={idx} variant="secondary" className="text-xs">
                                        {adv}
                                      </Badge>
                                    ))}
                                    {product.competition.winner.advantages.length > 2 && (
                                      <Badge variant="secondary" className="text-xs">
                                        +{product.competition.winner.advantages.length - 2}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        {/* End of update */}
                        <TableCell>
                          {priceTrackings[product.id] ? (
                            <div className="space-y-1">
                              <Badge className={priceTrackings[product.id].enabled
                                ? "bg-green-100 text-green-800 border-green-300"
                                : "bg-gray-100 text-gray-600 border-gray-300"
                              }>
                                {priceTrackings[product.id].enabled ? "✓ Activo" : "Pausado"}
                              </Badge>
                              <div className="text-xs text-muted-foreground">
                                Mín: ${priceTrackings[product.id].min_price}
                                {priceTrackings[product.id].max_price && (
                                  <> · Máx: ${priceTrackings[product.id].max_price}</>
                                )}
                              </div>
                              {priceTrackings[product.id].last_status && (
                                <div className="text-xs text-muted-foreground">
                                  {priceTrackings[product.id].last_status}
                                </div>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-gray-500">
                              Sin config
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {product.catalog_listing && product.status === "active" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => analyzeCompetition(product.id)}
                                  disabled={analyzingId === product.id}
                                >
                                  {analyzingId === product.id ? "Analizando..." : "Analizar"}
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => openEditModal(product)}>
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openTrackingModal(product)}
                                  title="Configurar seguimiento automático"
                                >
                                  ⚙️
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">No disponible</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {expandedRows.has(product.id) && product.competition && (
                        <TableRow>
                          {/* Start of update - Adjusted colspan from 10 to 11 */}
                          <TableCell colSpan={11} className="bg-gray-50 p-6">
                            {/* End of update */}
                            <div className="space-y-6">
                              {product.competition.status === "penalized" && (
                                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4">
                                  <h4 className="font-semibold text-lg flex items-center gap-2 text-red-800 mb-3">
                                    <span className="text-2xl">⚠️</span>
                                    Producto Penalizado - No Puede Competir
                                  </h4>
                                  <div className="space-y-3 text-sm">
                                    <p className="text-red-700">
                                      Tu publicación está penalizada y no puede competir en el catálogo. Esto
                                      significa que no aparecerá en la página del producto y tendrás menos
                                      visibilidad.
                                    </p>

                                    <div className="bg-white p-4 rounded border border-red-200">
                                      <p className="font-semibold text-red-800 mb-2">
                                        Razones comunes de penalización:
                                      </p>
                                      <ul className="list-disc list-inside space-y-1 text-gray-700">
                                        <li>Fotos de baja calidad o que no cumplen con las políticas</li>
                                        <li>Descripción incompleta o con información incorrecta</li>
                                        <li>Atributos faltantes o incorrectos del catálogo</li>
                                        <li>Historial de reclamos o incumplimientos</li>
                                        <li>Precio muy por encima del mercado</li>
                                        <li>Problemas con entregas anteriores</li>
                                      </ul>
                                    </div>

                                    <div className="bg-white p-4 rounded border border-red-200">
                                      <p className="font-semibold text-red-800 mb-2">
                                        Cómo resolver la penalización:
                                      </p>
                                      <ol className="list-decimal list-inside space-y-2 text-gray-700">
                                        <li>
                                          <strong>Mejora las fotos:</strong> Usa imágenes de alta calidad, con fondo
                                          blanco, que muestren el producto claramente
                                        </li>
                                        <li>
                                          <strong>Completa todos los atributos:</strong> Asegúrate de que todos los
                                          campos requeridos del catálogo estén completos y correctos
                                        </li>
                                        <li>
                                          <strong>Revisa la descripción:</strong> Debe ser clara, completa y sin
                                          información engañosa
                                        </li>
                                        <li>
                                          <strong>Ajusta el precio:</strong> Verifica que tu precio sea competitivo y
                                          esté dentro del rango del mercado
                                        </li>
                                        <li>
                                          <strong>Resuelve reclamos pendientes:</strong> Si tienes reclamos abiertos,
                                          resuélvelos lo antes posible
                                        </li>
                                        <li>
                                          <strong>Contacta soporte:</strong> Si después de hacer mejoras la
                                          penalización persiste, contacta al soporte de MercadoLibre
                                        </li>
                                      </ol>
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                      <Button
                                        size="sm"
                                        variant="default"
                                        asChild
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        <a
                                          href={`https://www.mercadolibre.com.ar/publicaciones/${product.id}/modificar`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          Editar Publicación en ML
                                        </a>
                                      </Button>
                                      <Button size="sm" variant="outline" asChild>
                                        <a
                                          href="https://www.mercadolibre.com.ar/ayuda"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          Contactar Soporte
                                        </a>
                                      </Button>
                                    </div>

                                    <p className="text-xs text-red-600 italic">
                                      Nota: Las penalizaciones pueden tardar varios días en resolverse después de
                                      hacer las correcciones necesarias.
                                    </p>
                                  </div>
                                </div>
                              )}

                              <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                  <h4 className="font-semibold mb-3 text-lg flex items-center gap-2">
                                    <span className="text-2xl">{getCompetitionIcon(product.competition.status)}</span>
                                    Análisis Detallado
                                  </h4>
                                  <div className="bg-white p-4 rounded-lg border space-y-3">
                                    <p className="text-sm">{getCompetitionExplanation(product.competition.status)}</p>

                                    <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                                      <div>
                                        <p className="text-xs text-muted-foreground">Tu Precio</p>
                                        <p className="text-lg font-bold text-blue-600">${product.price}</p>
                                      </div>
                                      {product.competition.price_to_win !== null && (
                                        <div>
                                          <p className="text-xs text-muted-foreground">Precio para Ganar</p>
                                          <p className="text-lg font-bold text-green-600">
                                            ${product.competition.price_to_win.toFixed(2)}
                                          </p>
                                        </div>
                                      )}
                                    </div>

                                    <div className="pt-3 border-t">
                                      <p className="text-xs text-muted-foreground mb-1">Participación en Visitas</p>
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                                          <div
                                            className="bg-blue-600 h-2 rounded-full transition-all"
                                            style={{ width: product.competition.visit_share }}
                                          />
                                        </div>
                                        <span className="text-sm font-semibold">
                                          {product.competition.visit_share}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {product.competition.winner && (
                                    <div className="bg-white p-4 rounded-lg border mt-4">
                                      <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                                        <span className="text-xl">🏆</span>
                                        Ganador Actual
                                      </h5>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Vendedor:</span>
                                          <span className="font-medium">{product.competition.winner.nickname}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Precio:</span>
                                          <span className="font-bold text-green-600">
                                            ${product.competition.winner.price.toFixed(2)}
                                          </span>
                                        </div>
                                        {product.competition.winner.advantages &&
                                          product.competition.winner.advantages.length > 0 && (
                                            <div className="pt-2 border-t">
                                              <p className="text-muted-foreground mb-2">Sus Ventajas:</p>
                                              <div className="flex flex-wrap gap-1">
                                                {product.competition.winner.advantages.map((adv, idx) => (
                                                  <Badge key={idx} variant="secondary" className="text-xs">
                                                    {adv}
                                                  </Badge>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <h4 className="font-semibold mb-3 text-lg flex items-center gap-2">
                                    <span className="text-2xl">✨</span>
                                    Oportunidades de Mejora
                                  </h4>

                                  {product.competition.boosts && product.competition.boosts.length > 0 ? (
                                    <div className="space-y-3">
                                      {product.competition.boosts
                                        .filter((boost) => boost.status === "opportunity")
                                        .map((boost, idx) => (
                                          <div
                                            key={idx}
                                            className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-lg border-2 border-amber-400 shadow-sm"
                                          >
                                            <div className="flex items-start justify-between mb-2">
                                              <div className="flex items-center gap-2">
                                                <span className="text-2xl">{getBoostIcon(boost.type)}</span>
                                                <div>
                                                  <p className="font-semibold text-gray-900">
                                                    {getBoostText(boost.type)}
                                                  </p>
                                                  {boost.description && (
                                                    <p className="text-sm text-gray-700 mt-1">{boost.description}</p>
                                                  )}
                                                </div>
                                              </div>
                                            </div>

                                            {boost.type === "price" && product.competition?.price_to_win && (
                                              <div className="mt-3 pt-3 border-t border-amber-300">
                                                <Label className="text-sm font-medium text-gray-900 mb-2 block">
                                                  Nuevo Precio Sugerido:
                                                </Label>
                                                <div className="flex gap-2">
                                                  <Input
                                                    type="number"
                                                    step="0.01"
                                                    placeholder={product.competition?.price_to_win?.toFixed(2)}
                                                    value={priceUpdateValue[product.id] || ""}
                                                    onChange={(e) =>
                                                      setPriceUpdateValue({
                                                        ...priceUpdateValue,
                                                        [product.id]: e.target.value,
                                                      })
                                                    }
                                                    className="flex-1"
                                                  />
                                                  <Button
                                                    size="sm"
                                                    onClick={() => {
                                                      const newPrice = Number.parseFloat(
                                                        priceUpdateValue[product.id] ||
                                                          product.competition!.price_to_win!.toString(),
                                                      )
                                                      if (newPrice > 0) {
                                                        applyPriceChange(product.id, newPrice)
                                                      }
                                                    }}
                                                    disabled={applyingBoost === `${product.id}-price`}
                                                    className="bg-green-600 hover:bg-green-700"
                                                  >
                                                    {applyingBoost === `${product.id}-price`
                                                      ? "Aplicando..."
                                                      : "Aplicar"}
                                                  </Button>
                                                </div>
                                              </div>
                                            )}

                                            {boost.type === "free_shipping" && (
                                              <div className="mt-3 pt-3 border-t border-amber-300">
                                                <Button
                                                  size="sm"
                                                  onClick={() => applyShippingBoost(product.id, "free_shipping")}
                                                  disabled={applyingBoost === `${product.id}-free_shipping`}
                                                  className="w-full bg-blue-600 hover:bg-blue-700"
                                                >
                                                  {applyingBoost === `${product.id}-free_shipping`
                                                    ? "Activando..."
                                                    : "Activar Envío Gratis"}
                                                </Button>
                                                <p className="text-sm text-gray-600 mt-2">
                                                  Nota: Esto puede tener costos adicionales según tu configuración
                                                </p>
                                              </div>
                                            )}

                                            {(boost.type === "installments" ||
                                              boost.type === "same_day_shipping" ||
                                              boost.type === "full_shipping") && (
                                              <div className="mt-3 pt-3 border-t border-amber-300">
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  asChild
                                                  className="w-full bg-transparent"
                                                >
                                                  <a
                                                    href={`https://www.mercadolibre.com.ar/publicaciones/${product.id}/modificar`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                  >
                                                    Configurar en MercadoLibre
                                                  </a>
                                                </Button>
                                                <p className="text-sm text-gray-600 mt-2">
                                                  Esta mejora requiere configuración manual
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        ))}

                                      {product.competition.boosts.filter((b) => b.status === "opportunity").length ===
                                        0 && (
                                        <div className="bg-white p-6 rounded-lg border text-center">
                                          <p className="text-sm text-muted-foreground">
                                            No hay oportunidades disponibles en este momento.
                                          </p>
                                          <p className="text-xs text-muted-foreground mt-2">
                                            ¡Sigue así! Tu publicación está optimizada.
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="bg-white p-6 rounded-lg border text-center">
                                      <p className="text-sm text-muted-foreground">
                                        No hay datos de oportunidades disponibles.
                                      </p>
                                    </div>
                                  )}

                                  {product.competition.boosts &&
                                    product.competition.boosts.filter((b) => b.status === "active").length > 0 && (
                                      <div className="mt-4">
                                        <h5 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                          <span>✅</span>
                                          Ventajas Activas
                                        </h5>
                                        <div className="flex flex-wrap gap-2">
                                          {product.competition.boosts
                                            .filter((boost) => boost.status === "active")
                                            .map((boost, idx) => (
                                              <Badge
                                                key={idx}
                                                className="bg-green-100 text-green-800 border-green-300"
                                              >
                                                {getBoostIcon(boost.type)} {getBoostText(boost.type)}
                                              </Badge>
                                            ))}
                                        </div>
                                      </div>
                                    )}
                                </div>
                              </div>

                              <div className="flex gap-2 pt-4 border-t">
                                <Button size="sm" variant="default" asChild>
                                  <a
                                    href={`https://www.mercadolibre.com.ar/p/${product.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Ver en MercadoLibre
                                  </a>
                                </Button>
                                <Button size="sm" variant="outline" asChild>
                                  <a
                                    href={`https://www.mercadolibre.com.ar/publicaciones/${product.id}/modificar`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Editar Publicación
                                  </a>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => analyzeCompetition(product.id)}
                                  disabled={analyzingId === product.id}
                                >
                                  {analyzingId === product.id ? "Analizando..." : "Re-analizar"}
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  Mostrando {(currentPage - 1) * mlPaging.limit + 1} -{" "}
                  {Math.min(currentPage * mlPaging.limit, mlPaging.total)} de {mlPaging.total.toLocaleString()}{" "}
                  publicaciones
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || loading}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm font-medium px-4">
                    Página {currentPage} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages || loading}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
