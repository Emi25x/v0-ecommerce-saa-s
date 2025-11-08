# Configuración de Estados de Órdenes

Este documento describe la configuración de estados y botones de acción para las órdenes de MercadoLibre.

## Estados de Disponibilidad

### 1. Pendiente
- **Descripción**: Orden recién creada, esperando que el vendedor tenga el producto disponible
- **Badge**: Naranja con ícono de reloj
- **Botón de acción**: "Ya tengo el producto"
- **Condición**: `hasHandlingTime(order) && remainingDays > 0`

### 2. Esperando disponibilidad
- **Descripción**: Orden esperando que el vendedor confirme disponibilidad del producto
- **Badge**: Naranja con ícono de reloj
- **Botón de acción**: "Ya tengo el producto"
- **Condición**: `hasHandlingTime(order) && remainingDays === 0`

### 3. Demorado
- **Descripción**: Orden que superó el tiempo de handling sin confirmación
- **Badge**: Rojo con ícono de alerta
- **Botón de acción**: "Ya tengo el producto"
- **Condición**: `hasHandlingTime(order) && remainingDays < 0`

### 4. Acordar la entrega
- **Descripción**: Orden con envío personalizado o retiro en persona
- **Badge**: Azul con ícono de handshake
- **Botón de acción**: "Avisar entrega"
- **Condición**: `shipping.mode === "custom" || shipping.mode === "me1" || !shipping.id`

### 5. Listo para enviar
- **Descripción**: Producto disponible, esperando impresión de etiqueta
- **Badge**: Verde con ícono de check
- **Botón de acción**: "Imprimir etiqueta"
- **Condición**: `shipping.status === "ready_to_ship"`

### 6. Etiqueta impresa
- **Descripción**: Etiqueta de envío impresa, esperando despacho
- **Badge**: Azul con ícono de printer
- **Botón de acción**: "Ver envío"
- **Condición**: `shipping.status === "ready_to_ship" && shipping.substatus === "printed"`

### 7. En camino
- **Descripción**: Paquete en tránsito hacia el comprador
- **Badge**: Azul con ícono de truck
- **Botón de acción**: "Ver detalles"
- **Condición**: `shipping.status === "shipped" || shipping.status === "delivered"`

### 8. En punto de retiro
- **Descripción**: Paquete disponible en punto de retiro
- **Badge**: Púrpura con ícono de map-pin
- **Botón de acción**: "Ver detalles"
- **Condición**: `shipping.substatus === "ready_for_pickup"`

### 9. Entregado
- **Descripción**: Orden completada y entregada al comprador
- **Badge**: Verde con ícono de check-circle
- **Botón de acción**: "Ver detalles"
- **Condición**: `shipping.status === "delivered" || tags.includes("delivered")`

### 10. Cancelado
- **Descripción**: Orden cancelada por el vendedor o comprador
- **Badge**: Gris con ícono de x-circle
- **Botón de acción**: Ninguno
- **Condición**: `status === "cancelled" || cancel_detail`

## Funciones Clave

### `hasHandlingTime(order: Order): boolean`
Determina si una orden tiene tiempo de handling (tiempo para preparar el producto).
- Retorna `false` para órdenes con `shipping.mode === "custom"` o `"me1"`
- Retorna `false` para órdenes sin `shipping.id`
- Retorna `true` para órdenes con `date_created` y `expiration_date`

### `getOrderAvailabilityStatus(order: Order): string`
Determina el estado de disponibilidad de una orden basándose en:
- Estado de la orden (`status`, `tags`)
- Estado del envío (`shipping.status`, `shipping.substatus`)
- Modo de envío (`shipping.mode`)
- Tiempo de handling y fechas

### `getActionButton(order: Order): JSX.Element | null`
Retorna el botón de acción apropiado según el estado de la orden.

## Filtros Disponibles

### Por Estado General
- Todas
- Entregadas
- En punto de retiro
- Etiqueta impresa
- En camino
- Acordar la entrega
- Demoradas
- Esperando disponibilidad
- Listas para enviar
- Pendientes
- Canceladas

### Por Tiempo de Disponibilidad
- Todas
- Demoradas (días restantes < 0)
- Vencen hoy (días restantes === 0)
- Vencen mañana (días restantes === 1)

## Paginación
- 50 órdenes por página
- Paginación del lado del servidor
- Filtros aplicados del lado del cliente sobre las órdenes cargadas
