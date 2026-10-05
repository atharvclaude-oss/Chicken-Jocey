"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Check, CheckCircle } from "@phosphor-icons/react";
import type { Product, RoomSummary } from "@shared/types";
import { Button, buttonClass } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";
import { useCart } from "@/store/cart";
import { formatPrice, pluralize } from "@/utils/format";

/** "Buy complete room" flow: everything starts selected, the user unticks what they don't need. */
export function BuyRoomSheet({
  open,
  onClose,
  room,
  products,
}: {
  open: boolean;
  onClose: () => void;
  room: RoomSummary;
  products: Product[];
}) {
  return (
    <Panel open={open} onClose={onClose} title="Buy the complete room" modal footer={null}>
      {/* Mounted only while open, so the selection resets each time the sheet opens. */}
      {open && <BuyRoomBody room={room} products={products} onClose={onClose} />}
    </Panel>
  );
}

function BuyRoomBody({ room, products, onClose }: { room: RoomSummary; products: Product[]; onClose: () => void }) {
  const addBundle = useCart((s) => s.addBundle);
  const [selected, setSelected] = useState(() => new Set(products.filter((p) => p.available).map((p) => p.id)));
  const [done, setDone] = useState(false);

  const chosen = products.filter((p) => selected.has(p.id));
  const total = chosen.reduce((sum, p) => sum + p.priceCents, 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (done) {
    return (
      <div className="py-10 text-center">
        <CheckCircle size={44} weight="fill" className="mx-auto text-accent" />
        <p className="mt-4 text-xl font-semibold tracking-tight">{room.name} is in your cart</p>
        <p className="mt-1 text-sm text-muted">{pluralize(chosen.length, "piece")}, {formatPrice(total)}</p>
        <div className="mt-8 flex flex-col gap-2">
          <Link href="/cart" className={buttonClass({ size: "lg", className: "w-full" })}>View cart</Link>
          <Button variant="secondary" size="lg" className="w-full" onClick={onClose}>Keep exploring</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">{room.name}</h2>
      <p className="mt-1 text-sm text-muted">
        {selected.size} of {pluralize(products.length, "product")} selected. Untick anything you already own.
      </p>

      <ul className="mt-5 space-y-1">
        {products.map((p) => {
          const checked = selected.has(p.id);
          return (
            <li key={p.id}>
              <label
                className={`flex items-center gap-3 rounded-control p-2 transition-colors ${
                  p.available ? "cursor-pointer hover:bg-sunken" : "opacity-55"
                }`}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={checked}
                  disabled={!p.available}
                  onChange={() => toggle(p.id)}
                />
                <span
                  aria-hidden
                  className={`grid size-5 shrink-0 place-items-center rounded-[6px] border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-accent ${
                    checked ? "border-fg bg-fg text-bg" : "border-line bg-surface"
                  }`}
                >
                  {checked && <Check size={12} weight="bold" />}
                </span>
                <span className="relative size-12 shrink-0 overflow-hidden rounded-[8px] bg-sunken">
                  <Image src={p.image} alt="" fill sizes="48px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-muted">{p.available ? p.color : "Currently unavailable"}</span>
                </span>
                <span className="font-mono text-sm tabular-nums">{formatPrice(p.priceCents)}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-5 mt-6 border-t border-line bg-surface px-5 pt-4 md:-mx-6 md:px-6">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Total</span>
          <span className="font-mono text-xl tabular-nums">{formatPrice(total)}</span>
        </div>
        <Button
          variant="accent"
          size="lg"
          className="mt-4 w-full"
          disabled={chosen.length === 0}
          onClick={() => {
            addBundle(room, chosen);
            setDone(true);
          }}
        >
          Add {pluralize(chosen.length, "item")} to cart
        </Button>
      </div>
    </>
  );
}
