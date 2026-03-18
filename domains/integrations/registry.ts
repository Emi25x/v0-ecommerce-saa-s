// Integration registry - central place to register and access all integrations

import type { BaseIntegration, IntegrationConfig } from "./types"

class IntegrationRegistry {
  private integrations = new Map<string, BaseIntegration>()

  register(integration: BaseIntegration) {
    this.integrations.set(integration.config.metadata.id, integration)
    console.log(`[Registry] Registered integration: ${integration.config.metadata.name}`)
  }

  get(id: string): BaseIntegration | undefined {
    return this.integrations.get(id)
  }

  getAll(): BaseIntegration[] {
    return Array.from(this.integrations.values())
  }

  getByCapability(capability: keyof IntegrationConfig["capabilities"]): BaseIntegration[] {
    return this.getAll().filter((integration) => {
      const cap = integration.config.capabilities[capability]
      return cap && cap.enabled
    })
  }

  getSources(): BaseIntegration[] {
    return this.getByCapability("source")
  }

  getDestinations(): BaseIntegration[] {
    return this.getByCapability("destination")
  }

  getConfigured(): BaseIntegration[] {
    return this.getAll().filter((integration) => integration.isConfigured())
  }
}

export const integrationRegistry = new IntegrationRegistry()
