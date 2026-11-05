---
id: orders-service
---
# Orders service

The system of record for orders.

## Rules

- Orders are written only after payment succeeds.

## Map

```archeion
parts:
  orders-endpoints:
    kind: api
    name: Orders endpoints
    does: HTTP endpoints for placing and reading orders
    contract: openapi/orders.yaml
    code: ["src/Orders.Api/Program.cs"]
  invoices:
    kind: module
    does: Serves invoices to customers
    code: ["src/Orders.Api/Invoices/**"]
  payments-client:
    kind: module
    name: Payments client
    does: Charges cards through the payment gateway
    code: ["src/Orders.Api/Payments/**"]
    httpTargets: { "/charges": payment-gateway }
  order-events:
    kind: module
    name: Order events
    does: Publishes domain events when orders change
    code: ["src/Orders.Api/Events/**"]
  legacy-export:
    kind: module
    name: Legacy export
    does: Exports orders as CSV for the old back office
    code: ["src/Orders.Api/Export/**"]
links:
  - legacy-export reads orders-db
  - orders-endpoints uses payments-client
  - orders-endpoints writes orders-db
  - orders-endpoints uses order-events
  - order-events publishes order-bus via order-submitted
  - payments-client calls payment-gateway via POST /charges
  - invoices reads orders-db
  - invoices uses invoice-pdf
  - invoice-pdf writes documents-store
```
