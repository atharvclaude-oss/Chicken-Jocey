"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { CaretDown, X } from "@phosphor-icons/react";
import type { CartItem } from "@shared/types";
import { Button, ButtonLink } from "@/components/common/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { lineTotal, useCart } from "@/store/cart";
import { formatPrice, pluralize } from "@/utils/format";
import { QuantityStepper } from "./QuantityStepper";

export function CartView() {
  const hydrated = useHydrated();
  const items = useCart((s) => s.items);

  if (!hydrated) {
    return (
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]" aria-busy="true">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24 rounded-card" />
          ))}
        </div>
        <div className="skeleton h-48 rounded-card" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-10 rounded-card border border-dashed border-line px-6 py-20 text-center">
        <p className="text-xl font-semibold tracking-tight">Your cart is empty</p>
        <p className="mx-auto mt-2 max-w-[38ch] text-muted">
          Open a room and click anything in it, or buy the whole room in one go.
        </p>
        <div className="mt-8 flex justify-center gap-2">
          <ButtonLink href="/" size="lg">Browse rooms</ButtonLink>
          <ButtonLink href="/catalogue" size="lg" variant="secondary">Shop catalogue</ButtonLink>
        </div>
      </div>
    );
  }

  const subtotal = items.reduce((sum, i) => sum + lineTotal(i), 0);

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-14">
      <ul className="divide-y divide-line border-y border-line">
        {items.map((item) => (
          <li key={item.kind === "product" ? `p-${item.productId}` : `b-${item.roomId}`} className="py-5">
            {item.kind === "product" ? <ProductLine item={item} /> : <BundleLine item={item} />}
          </li>
        ))}
      </ul>

      <aside className="h-fit rounded-card border border-line bg-surface p-6 lg:sticky lg:top-24">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Subtotal</span>
          <span className="font-mono text-2xl tabular-nums">{formatPrice(subtotal)}</span>
        </div>
        <p className="mt-2 text-sm text-muted">Shipping and taxes are calculated at checkout.</p>
        {/* TODO(week 4): checkout page with Stripe Elements; totals re-priced server-side. */}
        <Button size="lg" className="mt-6 w-full" disabled>
          Checkout
        </Button>
        <p className="mt-3 text-center text-xs text-muted">Checkout opens with the next release.</p>
      </aside>
    </div>
  );
}

function ProductLine({ item }: { item: Extract<CartItem, { kind: "product" }> }) {
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.removeProduct);
  return (
    <div className="flex gap-4">
      <Link href={`/products/${item.productId}`} className="relative size-20 shrink-0 overflow-hidden rounded-card bg-sunken md:size-24">
        <Image src={item.image} alt={item.name} fill sizes="96px" className="object-cover" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href={`/products/${item.productId}`} className="font-medium hover:underline">{item.name}</Link>
            <p className="text-sm text-muted">{formatPrice(item.priceCents)} each</p>
          </div>
          <p className="font-mono tabular-nums">{formatPrice(lineTotal(item))}</p>
        </div>
        <div className="mt-3 flex items-center justify-between">
          {/* min 0: stepping below 1 removes the line, as before. */}
          <QuantityStepper
            label={item.name}
            min={0}
            value={item.quantity}
            onChange={(next) => setQuantity(item.productId, next)}
          />
          <button type="button" onClick={() => remove(item.productId)} className="text-sm text-muted hover:text-fg">
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function BundleLine({ item }: { item: Extract<CartItem, { kind: "bundle" }> }) {
  const [expanded, setExpanded] = useState(false);
  const removeBundle = useCart((s) => s.removeBundle);
  const removeFromBundle = useCart((s) => s.removeFromBundle);
  return (
    <div>
      <div className="flex gap-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-card bg-sunken md:size-24">
          <Image src={item.image} alt={item.roomName} fill sizes="96px" className="object-cover" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{item.roomName} bundle</p>
              <p className="text-sm text-muted">{pluralize(item.products.length, "product")}</p>
            </div>
            <p className="font-mono tabular-nums">{formatPrice(lineTotal(item))}</p>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1.5 text-sm font-medium"
            >
              {expanded ? "Hide items" : "Show items"}
              <CaretDown size={14} className={`transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
            </button>
            <button type="button" onClick={() => removeBundle(item.roomId)} className="text-sm text-muted hover:text-fg">
              Remove
            </button>
          </div>
        </div>
      </div>
      {expanded && (
        <ul className="mt-4 space-y-1 rounded-card bg-sunken p-3 md:ml-28">
          {item.products.map((p) => (
            <li key={p.productId} className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
              <Link href={`/products/${p.productId}`} className="truncate hover:underline">{p.name}</Link>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-mono tabular-nums">{formatPrice(p.priceCents)}</span>
                <button
                  type="button"
                  onClick={() => removeFromBundle(item.roomId, p.productId)}
                  aria-label={`Remove ${p.name} from bundle`}
                  className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg"
                >
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
