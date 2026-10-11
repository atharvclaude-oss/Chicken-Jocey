// "New order" email to the team when a customer pays, so nobody has to keep refreshing
// /admin/orders. Sent through Resend's API (resend.com, free tier) when RESEND_API_KEY and
// ORDER_ALERT_EMAIL are set in backend/.env; otherwise alerts are off.

import type { Db } from "../../db/client.ts";

export type OrderAlert = (orderId: string) => Promise<void>;

const RESEND_URL = "https://api.resend.com/emails";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function resendOrderAlert({ db, apiKey, to, from, siteUrl }: { db: Db; apiKey: string; to: string; from: string; siteUrl: string }): OrderAlert {
  return async (orderId) => {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    const number = `ORD-${10000 + order.number}`;
    const a = order.shippingAddress as { name?: string; city?: string; state?: string; country?: string } | null;
    const items = order.items.map((i) => `${i.quantity} × ${i.productName} (${money(i.unitPriceCents * i.quantity)})`);
    const link = `${siteUrl}/admin/orders`;
    const text = [
      `New order ${number}: ${money(order.totalCents)} paid.`,
      "",
      ...items,
      "",
      a ? `Ship to ${a.name ?? ""}, ${[a.city, a.state, a.country].filter(Boolean).join(", ")}` : "No shipping address",
      "",
      `Buy it on AliExpress and mark it bought: ${link}`,
    ].join("\n");
    const html = `<p><strong>New order ${number}</strong>: ${money(order.totalCents)} paid.</p>
<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
<p>${a ? `Ship to ${esc(a.name ?? "")}, ${esc([a.city, a.state, a.country].filter(Boolean).join(", "))}` : "No shipping address"}</p>
<p><a href="${esc(link)}">Open the orders page</a> to buy it on AliExpress and mark it bought.</p>`;

    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `New order ${number}: ${money(order.totalCents)}`, text, html }),
    });
    if (!res.ok) throw new Error(`Order alert email failed: ${res.status} ${await res.text().catch(() => "")}`);
  };
}
