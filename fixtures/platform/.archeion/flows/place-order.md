---
id: place-order
name: Customer places an order
---
# Customer places an order

From the checkout page to the customer's confirmation email. Explains the intended architecture; it does not report observed traffic.

```archeion
steps:
  - checkout calls orders-endpoints | The checkout page submits the order
  - orders-endpoints uses payments-client | The API asks for payment before accepting the order
  - payments-client calls payment-gateway | The card is charged by the third party
  - orders-endpoints writes orders-db | The accepted order is stored
  - orders-endpoints uses order-events | The API announces the new order
  - order-events publishes order-bus | The event goes onto the shared bus
  - order-intake consumes order-bus | The worker picks the order up in another repository
  - order-intake uses shipping | Shipping is booked for the order
  - shipping calls carrier-api | Booking with the carrier is not established by any evidence
  - order-intake uses notifications | The customer is told the order is on its way
```
