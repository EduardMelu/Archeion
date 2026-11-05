---
archeion: 1
id: shop-web
name: Shop web
---
# Shop web

The storefront customers use in a browser.

## Map

```archeion
parts:
  storefront:
    kind: app
    name: Storefront
    does: Lets customers browse products, check out, and manage their account
    tech: React
    code: ["package.json", "src/**"]
    httpTargets: { "/api": orders-service }
```
