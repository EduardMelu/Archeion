---
id: customer-comms
---
# Customer communications

Spans repositories on purpose: rendering lives with orders, sending lives with fulfilment.

## Map

```archeion
parts:
  invoice-pdf:
    kind: capability
    name: Invoice PDF rendering
    does: Renders invoices and other documents as PDF files
    tech: QuestPDF
    code: ["src/Orders.Api/Documents/**"]
    reuse:
      - PDF rendering. Call InvoicePdfRenderer instead of adding another renderer.
```
