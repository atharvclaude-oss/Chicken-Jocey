import type { Metadata } from "next";
import { ButtonLink } from "@/components/common/Button";
import { formatPrice } from "@/utils/format";
import { ClearCart } from "./ClearCart";

export const metadata: Metadata = { title: "Order confirmed", robots: { index: false } };

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

interface PublicOrder {
  number: string;
  status: string;
  totalCents: number;
  items: { name: string; quantity: number; unitPriceCents: number }[];
}

const STATUS_COPY: Record<string, string> = {
  PAYMENT_PENDING: "We're confirming your payment. This page updates once Stripe confirms it.",
  PAID: "Payment received. We're preparing your order.",
  FULFILLING: "Your items are being prepared for shipping.",
  SHIPPED: "Your order is on its way.",
  DELIVERED: "Your order was delivered.",
};

async function getOrder(sessionId: string): Promise<PublicOrder | null> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/orders/checkout/${sessionId}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as PublicOrder) : null;
  } catch {
    return null;
  }
}

export default async function CheckoutSuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  const { session_id } = await searchParams;
  const order = typeof session_id === "string" ? await getOrder(session_id) : null;

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-16 md:px-8">
      <ClearCart />
      <h1 className="text-4xl font-semibold tracking-tighter">Thank you for your order.</h1>
      {order ? (
        <>
          <p className="mt-3 text-muted">
            Order <span className="font-mono text-fg">{order.number}</span>. {STATUS_COPY[order.status] ?? ""}
          </p>
          <ul className="mt-8 divide-y divide-line border-y border-line">
            {order.items.map((i) => (
              <li key={i.name} className="flex justify-between py-3 text-sm">
                <span>
                  {i.name} × {i.quantity}
                </span>
                <span className="font-mono tabular-nums">{formatPrice(i.unitPriceCents * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex justify-between font-medium">
            <span>Total</span>
            <span className="font-mono tabular-nums">{formatPrice(order.totalCents)}</span>
          </p>
        </>
      ) : (
        <p className="mt-3 text-muted">We couldn&apos;t load your order details, but your payment is safe. You&apos;ll get an email receipt from Stripe.</p>
      )}
      <ButtonLink href="/" size="lg" className="mt-10">Keep browsing</ButtonLink>
    </div>
  );
}
