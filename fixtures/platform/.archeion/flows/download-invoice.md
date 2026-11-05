---
id: download-invoice
name: Customer downloads an invoice
---
# Customer downloads an invoice

A short flow through one project and one shared resource.

```archeion
steps:
  - account-pages calls invoices | The account page asks for an invoice
  - invoices uses invoice-pdf | The invoice is rendered as a PDF
  - invoice-pdf writes documents-store | The PDF is stored for later downloads
```
