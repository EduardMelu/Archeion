export async function getInvoice(id: string) {
  // A dynamic URL is reported as unsupported; reviewed knowledge carries this link instead.
  return fetch(`/api/invoices/${id}/pdf`);
}

export const getOrder = (id: string) => fetch("/api/orders/" + id);
