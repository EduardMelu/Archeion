---
id: customer-comms
---
# Customer communications

The sending half of customer communications.

## Map

```archeion
parts:
  notifications:
    kind: capability
    name: Email notifications
    does: Sends transactional email to customers
    tech: SMTP
    code: ["src/Fulfilment.Worker/Email/**"]
    reuse:
      - Send email through EmailSender; it already handles templates and retries.
```
