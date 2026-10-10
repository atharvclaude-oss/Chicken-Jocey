// Proxies checkout to the backend so the browser never needs the API's address.
// The backend prices the order; this route only forwards ids and quantities.

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    const res = await fetch(`${BACKEND_URL}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = res.status < 500 && typeof data.error === "string" ? data.error : "Checkout is unavailable right now.";
      return Response.json({ error }, { status: res.status });
    }
    return Response.json({ url: data.url, number: data.number }, { status: 201 });
  } catch {
    return Response.json({ error: "Checkout is unavailable right now." }, { status: 503 });
  }
}
