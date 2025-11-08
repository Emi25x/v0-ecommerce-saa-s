// Core integration types and interfaces

export type IntegrationCapability = "source" | "destination" | "stock_sync" | "orders" | "webhooks"

export type AuthType = "api_token" | "oauth" | "jwt" | "none"

export interface IntegrationAuth {
  type: AuthType
  required: string[] // Environment variables or config needed
  tokenStorage?: "cookie" | "database" | "both"
  tokenExpiry?: number // in seconds
}

export interface IntegrationMetadata {
  id: string
  name: string
  description: string
  icon?: string
  color?: string
  website?: string
  docsUrl?: string
}

export interface IntegrationCapabilities {
  source?: {
    enabled: boolean
    supportsImport: boolean
    supportsPagination: boolean
    supportsFilters: boolean
    supportsWebhooks: boolean
  }
  destination?: {
    enabled: boolean
    supportsCreate: boolean
    supportsUpdate: boolean
    supportsDelete: boolean
    supportsBulk: boolean
  }
  stockSync?: {
    enabled: boolean
    direction: "unidirectional" | "bidirectional"
    supportsRealtime: boolean
    supportsBatch: boolean
  }
  orders?: {
    enabled: boolean
    supportsCreate: boolean
    supportsUpdate: boolean
    supportsTracking: boolean
    supportsWebhooks: boolean
  }
}

export interface IntegrationConfig {
  metadata: IntegrationMetadata
  auth: IntegrationAuth
  capabilities: IntegrationCapabilities
  endpoints: {
    auth?: string
    test?: string
    products?: string
    stock?: string
    orders?: string
    webhooks?: string
  }
}

// Generic product interface that all integrations must map to
export interface UnifiedProduct {
  id: string
  sku?: string
  title: string
  description?: string
  price: number
  compareAtPrice?: number
  cost?: number
  inventory: number
  images: string[]
  weight?: number
  dimensions?: {
    width?: number
    height?: number
    length?: number
  }
  brand?: string
  category?: string
  tags?: string[]
  active: boolean
  metadata?: Record<string, any>
  platformData?: Record<string, any> // Platform-specific data
}

// Generic order interface
export interface UnifiedOrder {
  id: string
  orderNumber?: string
  date: string
  customer: {
    name: string
    email?: string
    phone?: string
    address?: {
      street?: string
      city?: string
      state?: string
      zip?: string
      country?: string
    }
  }
  items: Array<{
    sku: string
    productId?: string
    title: string
    quantity: number
    price: number
  }>
  subtotal: number
  tax?: number
  shipping?: number
  total: number
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled"
  trackingNumber?: string
  metadata?: Record<string, any>
}

// Base integration interface that all integrations must implement
export interface BaseIntegration {
  config: IntegrationConfig

  // Authentication
  isConfigured(): boolean
  authenticate?(credentials: Record<string, any>): Promise<{ token: string; expiresAt?: string }>
  testConnection?(): Promise<boolean>

  // Products (Source capability)
  getProducts?(params?: {
    page?: number
    pageSize?: number
    filters?: Record<string, any>
  }): Promise<{ products: UnifiedProduct[]; total: number }>

  getProduct?(id: string): Promise<UnifiedProduct | null>

  // Products (Destination capability)
  createProduct?(product: UnifiedProduct): Promise<{ id: string }>
  updateProduct?(id: string, updates: Partial<UnifiedProduct>): Promise<void>
  deleteProduct?(id: string): Promise<void>

  // Stock Sync
  updateStock?(sku: string, quantity: number): Promise<void>
  syncStock?(products: Array<{ sku: string; quantity: number }>): Promise<void>

  // Orders
  createOrder?(order: UnifiedOrder): Promise<{ id: string }>
  getOrders?(filters?: Record<string, any>): Promise<UnifiedOrder[]>
  updateOrderStatus?(id: string, status: UnifiedOrder["status"]): Promise<void>

  // Webhooks
  handleWebhook?(payload: any): Promise<void>
}
