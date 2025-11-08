# MercadoLibre Shipments API - Documentación Completa

## Estados de Envíos (Shipment Status)

### Estados Principales
- **`pending`**: Envío pendiente, esperando acción del vendedor
- **`handling`**: Vendedor está preparando el producto para envío
- **`ready_to_ship`**: Producto listo para enviar, etiqueta disponible
- **`shipped`**: Producto enviado, en tránsito
- **`delivered`**: Producto entregado al comprador
- **`not_delivered`**: Producto no entregado
- **`cancelled`**: Envío cancelado

### Subestados (Substatus)
- **`printed`**: Etiqueta impresa (bajo `ready_to_ship`)
- **`out_for_delivery`**: En camino para entrega (bajo `shipped`)
- **`returning_to_sender`**: Regresando al vendedor (bajo `not_delivered`)
- **`ready_for_pickup`**: Listo para recoger en punto de entrega

## Modos de Envío (Shipping Mode)

### ME2 (Mercado Envíos 2)
- Etiquetas prepagadas
- Tracking automático
- Gestión completa por MercadoLibre
- Requiere marcar producto como "ready_to_ship"

### ME1 (Mercado Envíos 1)
- Vendedor usa su propia logística
- Debe proporcionar tracking manualmente
- Visible en panel de MercadoLibre

### Custom (Acordar con el comprador)
- Sin handling time tradicional
- Vendedor y comprador coordinan entrega
- Puede ser retiro en persona o entrega acordada
- No genera etiqueta automática

## Endpoints Disponibles

### 1. Obtener Envíos
**Endpoint**: `GET /orders/search`
- **Descripción**: Obtiene envíos a través de órdenes
- **Parámetros**:
  - `seller`: ID del vendedor
  - `order.status`: Estado de la orden
  - `order.date_created.from`: Fecha desde
  - `order.date_created.to`: Fecha hasta
  - `limit`: Límite de resultados (default: 50)
  - `offset`: Offset para paginación
  - `sort`: Ordenamiento (date_desc, date_asc)
- **Implementado**: ✅ `lib/mercadolibre.ts::getMercadoLibreShipments()`

### 2. Obtener Detalles de Envío
**Endpoint**: `GET /shipments/{shipment_id}`
- **Descripción**: Obtiene detalles completos de un envío específico
- **Headers**: `x-format-new: true` (recomendado)
- **Respuesta incluye**:
  - `status` y `substatus`
  - `tracking_number` y `tracking_method`
  - `receiver_address` y `sender_address`
  - `date_created`, `last_updated`, `date_first_printed`
  - `status_history`: Historial de cambios de estado
  - `estimated_delivery_time` con `handling` time
- **Implementado**: ✅ `lib/mercadolibre.ts::getShipmentDetails()`

### 3. Obtener Etiqueta de Envío
**Endpoint**: `GET /shipment_labels`
- **Descripción**: Descarga etiqueta de envío en PDF
- **Parámetros**:
  - `shipment_ids`: ID del envío (puede ser múltiple separado por comas)
  - `response_type`: Formato de respuesta (`pdf`, `zpl`)
- **Respuesta**: URL del PDF o código ZPL para impresoras térmicas
- **Implementado**: ✅ `lib/mercadolibre.ts::getShippingLabel()`

### 4. Actualizar Estado de Envío
**Endpoint**: `PUT /shipments/{shipment_id}`
- **Descripción**: Actualiza el estado del envío (ej: marcar como ready_to_ship)
- **Body**:
  \`\`\`json
  {
    "status": "ready_to_ship"
  }
  \`\`\`
- **Implementado**: ✅ `app/api/mercadolibre/orders/[id]/mark-received/route.ts`

### 5. Obtener SLA de Envío
**Endpoint**: `GET /shipments/{shipment_id}/sla`
- **Descripción**: Obtiene fecha máxima para enviar productos
- **Respuesta**: Información sobre plazos de envío
- **Implementado**: ❌ **PENDIENTE**

### 6. Enviar Número de Tracking (Claims)
**Endpoint**: Disponible en contexto de reclamos
- **Descripción**: Permite enviar número de tracking en caso de reclamos
- **Acción**: `send_tracking_number`
- **Implementado**: ❌ **PENDIENTE**

## Webhooks de Envíos

### Topic: `shipments`
- **Trigger**: Creación de envío o cambio en el JSON del envío
- **Notificación incluye**:
  - `resource`: URL del recurso modificado
  - `user_id`: ID del usuario
  - `topic`: "shipments"
  - `application_id`: ID de la aplicación
  - `attempts`: Número de intentos de notificación
  - `sent`: Fecha de envío
  - `received`: Fecha de recepción
- **Implementado**: ✅ `app/api/mercadolibre/webhooks/route.ts`

## Flujos de Trabajo

### Flujo ME2 (Mercado Envíos 2)
1. **Orden creada** → `status: pending`
2. **Vendedor recibe producto** → Marca como "Ya tengo el producto"
3. **Sistema actualiza** → `status: ready_to_ship`, `substatus: printed`
4. **Etiqueta disponible** → Vendedor puede imprimir
5. **Producto enviado** → `status: shipped`
6. **En camino** → `substatus: out_for_delivery`
7. **Entregado** → `status: delivered`

### Flujo Custom (Acordar Entrega)
1. **Orden creada** → `shipping.mode: custom`
2. **Vendedor coordina con comprador** → Mensajería de ML
3. **Entrega acordada** → Sin etiqueta automática
4. **Confirmación manual** → Vendedor marca como entregado

### Flujo ME1 (Mercado Envíos 1)
1. **Orden creada** → `status: pending`
2. **Vendedor prepara envío** → Usa su propia logística
3. **Vendedor proporciona tracking** → Actualiza manualmente
4. **Seguimiento visible** → En panel de MercadoLibre

## Campos Importantes

### Shipment Object
\`\`\`typescript
{
  id: string                    // ID del envío
  order_id: string              // ID de la orden asociada
  status: string                // Estado principal
  substatus: string             // Subestado
  tracking_number: string       // Número de tracking
  tracking_method: string       // Método de tracking
  date_created: string          // Fecha de creación
  last_updated: string          // Última actualización
  date_first_printed: string    // Primera impresión de etiqueta
  receiver_address: object      // Dirección del comprador
  sender_address: object        // Dirección del vendedor
  shipment_type: string         // Tipo de envío
  shipping_mode: string         // Modo (me1, me2, custom)
  shipping_option: object       // Opciones de envío
  cost: number                  // Costo del envío
  base_cost: number             // Costo base
  status_history: object        // Historial de estados
  estimated_delivery_time: {
    type: string
    date: string
    unit: string
    offset: { date: string }
    time_frame: { from: string, to: string }
    handling: number            // Tiempo de manejo en horas
    shipping: number            // Tiempo de envío en horas
  }
}
\`\`\`

## Funcionalidades Adicionales a Implementar

### 1. Tracking Detallado
- **Endpoint**: Usar `status_history` del shipment
- **Funcionalidad**: Mostrar línea de tiempo con todos los eventos
- **UI**: Timeline component con estados y fechas

### 2. SLA Monitoring
- **Endpoint**: `GET /shipments/{shipment_id}/sla`
- **Funcionalidad**: Alertas cuando se acerca fecha límite de envío
- **UI**: Badge de advertencia en órdenes próximas a vencer

### 3. Impresión Masiva de Etiquetas
- **Endpoint**: `GET /shipment_labels?shipment_ids=id1,id2,id3`
- **Funcionalidad**: Imprimir múltiples etiquetas en un solo PDF
- **UI**: Checkbox para seleccionar múltiples envíos

### 4. Conversión a ZPL para Impresoras Térmicas
- **Endpoint**: `GET /shipment_labels?response_type=zpl`
- **Funcionalidad**: Obtener código ZPL para impresoras térmicas
- **UI**: Opción de descarga en formato ZPL

### 5. Gestión de Reclamos con Tracking
- **Endpoint**: Claims API con `send_tracking_number`
- **Funcionalidad**: Enviar tracking en caso de reclamos
- **UI**: Formulario para agregar tracking a reclamos

### 6. Notificaciones en Tiempo Real
- **Webhook**: Ya implementado
- **Funcionalidad**: Actualizar UI automáticamente cuando cambia estado
- **UI**: Toast notifications o actualizaciones en vivo

### 7. Filtros Avanzados
- **Filtros adicionales**:
  - Por modo de envío (ME1, ME2, Custom)
  - Por subestado
  - Por fecha de impresión de etiqueta
  - Por tracking disponible/no disponible
- **UI**: Filtros adicionales en página de envíos

### 8. Estadísticas de Envíos
- **Métricas**:
  - Tiempo promedio de handling
  - Tasa de entregas exitosas
  - Envíos demorados
  - Costo promedio de envío
- **UI**: Dashboard con gráficos

## Estado Actual de Implementación

### ✅ Implementado
- Obtener lista de envíos desde órdenes
- Obtener detalles de envío específico
- Obtener etiqueta de envío (PDF)
- Actualizar estado a ready_to_ship
- Webhooks para notificaciones de cambios
- Procesamiento de notificaciones de envíos
- Almacenamiento en base de datos (ml_shipments)

### ❌ Pendiente
- Endpoint SLA de envíos
- Tracking detallado con historial
- Impresión masiva de etiquetas
- Formato ZPL para impresoras térmicas
- Gestión de reclamos con tracking
- Filtros avanzados por modo y subestado
- Dashboard de estadísticas de envíos
- Notificaciones en tiempo real en UI

## Recomendaciones

1. **Prioridad Alta**: Implementar tracking detallado con `status_history`
2. **Prioridad Alta**: Agregar SLA monitoring para alertas de vencimiento
3. **Prioridad Media**: Impresión masiva de etiquetas
4. **Prioridad Media**: Filtros avanzados por modo de envío
5. **Prioridad Baja**: Conversión a ZPL (solo si se usan impresoras térmicas)
6. **Prioridad Baja**: Dashboard de estadísticas

## Referencias
- [MercadoLibre Shipments API](https://developers.mercadolibre.com.ar/en_us/shipment-handling)
- [MercadoLibre Manage Shipments](https://developers.mercadolibre.com.ar/devsite/manage-shipments)
- [MercadoLibre Notifications](https://developers.mercadolibre.com.ar/en_us/products-receive-notifications)
