---
id: fulfilment-service
---
# Fulfilment service

Runs continuously in the background and has no HTTP surface of its own.

## Map

```archeion
parts:
  order-intake:
    kind: module
    name: Order intake
    does: Receives accepted orders from the order bus
    code: ["src/Fulfilment.Worker/Worker.cs"]
  shipping:
    kind: module
    does: Books a carrier and tracks the shipment
    code: ["src/Fulfilment.Worker/Shipping/**"]
links:
  - order-intake consumes order-bus via order-submitted
  - order-intake uses shipping
  - order-intake uses notifications
  - notifications reads documents-store
  - shipping calls carrier-api via POST /shipments
```
