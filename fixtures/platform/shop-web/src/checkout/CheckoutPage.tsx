import { useState } from "react";

export function CheckoutPage() {
  const [status, setStatus] = useState("idle");

  async function submit(order: unknown) {
    const response = await fetch("/api/orders", { method: "POST", body: JSON.stringify(order) });
    setStatus(response.ok ? "placed" : "failed");
  }

  async function applyGiftCard(code: string) {
    // Not served by any known route: stays visible as an unknown connection.
    await fetch("/api/gift-cards", { method: "POST", body: code });
  }

  return <button onClick={() => submit({})} onDoubleClick={() => applyGiftCard("x")}>{status}</button>;
}
