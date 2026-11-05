---
archeion: 1
id: acme
name: Acme platform (synthetic)
---
# Acme platform

Sells goods online, takes payment, and ships orders. Knowledge here covers what no single repository owns.

## Map

```archeion
parts:
  customer-comms:
    kind: system
    name: Customer communications
    does: Everything a customer receives from us, across the API and the worker
  platform-vault:
    kind: secrets
    name: Platform vault
    does: Holds platform secrets; defined by the infrastructure team outside these repositories
    tech: Azure Key Vault
    resource: { type: Microsoft.KeyVault/vaults, identifier: acme-platform-kv }
  payment-gateway:
    kind: external
    name: Payment gateway
    does: Charges customer cards
    tech: Third-party HTTP API
links:
  - orders-service reads platform-vault
  - fulfilment-service reads platform-vault
```
