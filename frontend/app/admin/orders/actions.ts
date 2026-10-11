"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, ORDERS_PAGE, adminFetch, same, sessionToken } from "./session";

// The only things the orders page can ask the server to do. Every step re-checks the session
// (in adminFetch) before touching an order.

export async function login(formData: FormData) {
  const password = process.env.ADMIN_PASSWORD;
  const given = String(formData.get("password") ?? "");
  // A small fixed delay makes password guessing slow.
  await new Promise((r) => setTimeout(r, 400));
  if (!password || !same(given, password)) redirect(`${ORDERS_PAGE}?error=${encodeURIComponent("Wrong password")}`);
  (await cookies()).set(ADMIN_COOKIE, sessionToken()!, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect(ORDERS_PAGE);
}

export async function logout() {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect(ORDERS_PAGE);
}

async function step(id: string, action: "purchased" | "shipped" | "delivered" | "cancel", body?: object) {
  const res = await adminFetch(`/fulfillments/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify(body ?? {}) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    redirect(`${ORDERS_PAGE}?error=${encodeURIComponent(typeof data.error === "string" ? data.error : `Couldn't update the order (${res.status})`)}`);
  }
  revalidatePath(ORDERS_PAGE);
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function markPurchased(formData: FormData) {
  const dollars = text(formData, "cost");
  const cost = dollars ? Math.round(Number(dollars.replace(/[$,]/g, "")) * 100) : undefined;
  await step(text(formData, "id"), "purchased", {
    supplierOrderId: text(formData, "supplierOrderId"),
    ...(cost !== undefined && Number.isFinite(cost) ? { costCents: cost } : {}),
  });
}

export async function markShipped(formData: FormData) {
  const url = text(formData, "trackingUrl");
  await step(text(formData, "id"), "shipped", { trackingNumber: text(formData, "trackingNumber"), ...(url ? { trackingUrl: url } : {}) });
}

export async function markDelivered(formData: FormData) {
  await step(text(formData, "id"), "delivered");
}

export async function cancelItem(formData: FormData) {
  await step(text(formData, "id"), "cancel", { note: text(formData, "note") });
}
