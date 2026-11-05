---
archeion: 1
id: orders-api
name: Orders API
---
# Orders API

Accepts orders, takes payment, and produces invoices.

## Map

```archeion
parts:
  orders-service:
    kind: service
    name: Orders service
    does: Accepts and prices orders, takes payment, and issues invoices
    tech: ASP.NET Core
    code: ["src/Orders.Api/**"]
  orders-db:
    kind: database
    name: Orders database
    does: Stores orders and invoices
    tech: Azure SQL
    resource: { type: Microsoft.Sql/servers, identifier: acme-orders-sql }
  order-bus:
    kind: queue
    name: Order bus
    does: Carries order events between services
    tech: Azure Service Bus
    topics: [order-submitted]
    resource: { type: Microsoft.ServiceBus/namespaces, identifier: acme-bus }
  documents-store:
    kind: storage
    name: Documents store
    does: Holds invoices and packing slips as files
    tech: Azure Blob Storage
    resource: { type: Microsoft.Storage/storageAccounts, identifier: acmedocs }
```
