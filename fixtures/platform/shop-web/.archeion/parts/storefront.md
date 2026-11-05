---
id: storefront
---
# Storefront

The customer-facing single-page application. It talks to the rest of the platform only over HTTP.

## Rules

- Payment details never pass through this application's own storage.

## Map

```archeion
parts:
  checkout:
    kind: module
    does: Collects delivery details and submits the order
    code: ["src/checkout/**"]
  catalog-browser:
    kind: module
    does: Lists and filters products
    code: ["src/catalog/**"]
  account-pages:
    kind: module
    does: Shows a customer's orders and invoices
    code: ["src/account/**"]
links:
  - checkout calls orders-endpoints via POST /orders
  - account-pages calls invoices via GET /invoices/{id}/pdf
```
