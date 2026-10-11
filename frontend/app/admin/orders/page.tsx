import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CopyButton } from "@/components/admin/CopyButton";
import { formatPrice } from "@/utils/format";
import { cancelItem, login, logout, markDelivered, markPurchased, markShipped } from "./actions";
import { adminFetch, isSignedIn } from "./session";

export const metadata: Metadata = { title: "Orders", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface Address {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postalCode: string;
  country: string;
  phone?: string | null;
}

interface Fulfillment {
  id: string;
  status: string;
  supplierOrderId: string | null;
  actualCostCents: number | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  note: string;
  createdAt: string;
  order: { number: number; email: string | null; shippingAddress: Address | null; status: string; totalCents: number; paidAt: string | null };
  items: { productName: string; quantity: number; unitPriceCents: number; variant: { color: string; image: string; product: { slug: string } } }[];
  supplierProduct: { url: string; supplier: { name: string; platform: string } } | null;
}

const GROUPS: { title: string; hint: string; statuses: string[] }[] = [
  { title: "To buy", hint: "Paid by the customer. Buy each on AliExpress, shipping to their address, then mark it bought.", statuses: ["AWAITING_APPROVAL", "MANUAL_REVIEW"] },
  { title: "Bought, waiting to ship", hint: "Add the tracking number once the AliExpress seller ships.", statuses: ["SUPPLIER_PAID", "SUPPLIER_ORDER_CREATED"] },
  { title: "Shipped", hint: "The customer sees this tracking on their order page.", statuses: ["SHIPPED"] },
  { title: "Done", hint: "", statuses: ["DELIVERED", "CANCELLED"] },
];

const orderNumber = (n: number) => `ORD-${10000 + n}`;

const STATUS_LABEL: Record<string, string> = {
  AWAITING_APPROVAL: "To buy",
  MANUAL_REVIEW: "To buy",
  SUPPLIER_PAID: "Bought",
  SUPPLIER_ORDER_CREATED: "Bought",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Orders paid before a product had a stored link still get a search for it. */
const searchLink = (name: string) => `https://www.aliexpress.us/w/wholesale-${name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/ +/g, "-")}.html`;

const addressText = (a: Address) =>
  [a.name, a.line1, a.line2, `${a.city}${a.state ? `, ${a.state}` : ""} ${a.postalCode}`, a.country, a.phone ? `Phone: ${a.phone}` : null].filter(Boolean).join("\n");

const input = "h-10 rounded-control border border-line bg-surface px-3 text-sm outline-none focus:border-fg/50";
const primary = "h-10 rounded-full bg-fg px-5 text-sm font-medium text-bg";

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? error : null;

  if (!(await isSignedIn())) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24">
        <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-2 text-sm text-muted">Team only.</p>
        <form action={login} className="mt-8 flex flex-col gap-3">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className={input} />
          {message && <p className="text-sm text-red-600">{message}</p>}
          <button type="submit" className={primary}>
            Sign in
          </button>
        </form>
        {!process.env.ADMIN_PASSWORD && <p className="mt-6 text-sm text-red-600">Set ADMIN_PASSWORD and ADMIN_API_KEY in frontend/.env.local first.</p>}
      </div>
    );
  }

  const res = await adminFetch("/fulfillments");
  const fulfillments: Fulfillment[] = res.ok ? await res.json() : [];

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-24 pt-10 md:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-2 text-muted">Every paid item, bought by hand on AliExpress and shipped straight to the customer.</p>
        </div>
        <form action={logout}>
          <button type="submit" className="text-sm text-muted underline underline-offset-4 hover:text-fg">
            Sign out
          </button>
        </form>
      </div>

      {!res.ok && <p className="mt-6 rounded-card border border-red-300 p-4 text-sm text-red-700">Couldn&apos;t reach the order system ({res.status}). Is the backend running?</p>}
      {message && <p className="mt-6 rounded-card border border-red-300 p-4 text-sm text-red-700">{message}</p>}

      {GROUPS.map((g) => {
        const list = fulfillments.filter((f) => g.statuses.includes(f.status));
        return (
          <section key={g.title} className="mt-12">
            <h2 className="text-xl font-semibold">
              {g.title} <span className="font-mono text-sm text-muted">({list.length})</span>
            </h2>
            {g.hint && <p className="mt-1 text-sm text-muted">{g.hint}</p>}
            {list.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Nothing here.</p>
            ) : (
              <ul className="mt-5 space-y-5">
                {list.map((f) => (
                  <li key={f.id}>
                    <OrderCard f={f} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function OrderCard({ f }: { f: Fulfillment }) {
  const a = f.order.shippingAddress;
  const paid = f.items.reduce((n, i) => n + i.unitPriceCents * i.quantity, 0);
  return (
    <article className="rounded-card border border-line bg-surface p-5 md:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-mono text-sm">
          {orderNumber(f.order.number)} · {f.order.paidAt ? new Date(f.order.paidAt).toLocaleString() : "unpaid"}
        </p>
        <p className="text-xs uppercase tracking-wider text-muted">{STATUS_LABEL[f.status] ?? f.status.replaceAll("_", " ").toLowerCase()}</p>
      </header>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Ship to</p>
          {a ? (
            <>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed">{addressText(a)}</pre>
              {f.order.email && <p className="mt-1 text-sm text-muted">{f.order.email}</p>}
              <div className="mt-3">
                <CopyButton text={addressText(a)} label="Copy address" />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-red-600">No shipping address on this order.</p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Buy</p>
          <ul className="mt-2 space-y-3">
            {f.items.map((i) => (
              <li key={i.productName} className="flex gap-3">
                {i.variant.image && (
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-control bg-sunken">
                    <Image src={i.variant.image} alt="" fill sizes="64px" className="object-cover" />
                  </div>
                )}
                <div className="text-sm">
                  <p className="font-medium">
                    {i.quantity} × {i.productName}
                  </p>
                  {i.variant.color && <p className="text-muted">Colour: {i.variant.color}</p>}
                  <p className="text-muted">Customer paid {formatPrice(i.unitPriceCents * i.quantity)}</p>
                  <Link href={`/products/${i.variant.product.slug}`} target="_blank" className="text-xs underline underline-offset-4">
                    Our product page
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {(f.supplierProduct || f.items[0]) && (
            <a
              href={f.supplierProduct?.url ?? searchLink(f.items[0]!.productName)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${primary} mt-4 inline-flex items-center`}
            >
              Find on AliExpress
            </a>
          )}
        </div>
      </div>

      {(f.supplierOrderId || f.trackingNumber || f.note) && (
        <dl className="mt-5 grid grid-cols-[150px_1fr] gap-y-1 border-t border-line pt-4 text-sm">
          {f.supplierOrderId && (
            <>
              <dt className="text-muted">AliExpress order</dt>
              <dd className="font-mono">{f.supplierOrderId}</dd>
            </>
          )}
          {f.actualCostCents !== null && (
            <>
              <dt className="text-muted">We paid</dt>
              <dd>
                {formatPrice(f.actualCostCents)} <span className="text-muted">(margin {formatPrice(paid - f.actualCostCents)})</span>
              </dd>
            </>
          )}
          {f.trackingNumber && (
            <>
              <dt className="text-muted">Tracking</dt>
              <dd>
                <a href={f.trackingUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="font-mono underline underline-offset-4">
                  {f.trackingNumber}
                </a>
              </dd>
            </>
          )}
          {f.note && (
            <>
              <dt className="text-muted">Note</dt>
              <dd>{f.note}</dd>
            </>
          )}
        </dl>
      )}

      <div className="mt-5 border-t border-line pt-4">
        {["AWAITING_APPROVAL", "MANUAL_REVIEW"].includes(f.status) && (
          <>
            <form action={markPurchased} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={f.id} />
              <label className="flex flex-col gap-1 text-xs text-muted">
                AliExpress order number
                <input name="supplierOrderId" required className={`${input} w-56`} placeholder="e.g. 8123456789012345" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                What we paid (USD, incl. shipping)
                <input name="cost" inputMode="decimal" className={`${input} w-40`} placeholder="e.g. 18.40" />
              </label>
              <button type="submit" className={primary}>
                Mark bought
              </button>
            </form>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-muted">Can&apos;t buy it?</summary>
              <form action={cancelItem} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={f.id} />
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Reason
                  <input name="note" required className={`${input} w-72`} placeholder="Sold out everywhere" />
                </label>
                <button type="submit" className="h-10 rounded-full border border-red-300 px-5 text-sm text-red-700">
                  Cancel this item
                </button>
              </form>
              <p className="mt-2 text-xs text-muted">Then refund the customer in the Stripe dashboard.</p>
            </details>
          </>
        )}
        {["SUPPLIER_PAID", "SUPPLIER_ORDER_CREATED"].includes(f.status) && (
          <form action={markShipped} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={f.id} />
            <label className="flex flex-col gap-1 text-xs text-muted">
              Tracking number
              <input name="trackingNumber" required className={`${input} w-56`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Tracking link (optional)
              <input name="trackingUrl" type="url" className={`${input} w-72`} placeholder="Defaults to 17track" />
            </label>
            <button type="submit" className={primary}>
              Mark shipped
            </button>
          </form>
        )}
        {f.status === "SHIPPED" && (
          <form action={markDelivered}>
            <input type="hidden" name="id" value={f.id} />
            <button type="submit" className={primary}>
              Mark delivered
            </button>
          </form>
        )}
        {["DELIVERED", "CANCELLED"].includes(f.status) && <p className="text-sm text-muted">{f.status === "DELIVERED" ? "Delivered." : "Cancelled."}</p>}
      </div>
    </article>
  );
}
