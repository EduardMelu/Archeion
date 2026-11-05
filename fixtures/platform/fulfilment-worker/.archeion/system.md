---
archeion: 1
id: fulfilment-worker
name: Fulfilment worker
---
# Fulfilment worker

Turns accepted orders into shipments.

## Map

```archeion
parts:
  fulfilment-service:
    kind: worker
    name: Fulfilment service
    does: Picks up accepted orders, books shipping, and tells the customer
    tech: .NET worker
    code: ["src/Fulfilment.Worker/**"]
contributes:
  documents-store:
    reuse:
      - Packing slips and invoices are stored here; read them rather than rendering again.
```
