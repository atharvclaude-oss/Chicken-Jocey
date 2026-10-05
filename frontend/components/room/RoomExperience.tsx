"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Product, RoomSummary } from "@shared/types";
import { Button } from "@/components/common/Button";
import { useRoomStore } from "@/store/room";
import { track } from "@/utils/analytics";
import { formatPrice, formatPriceWhole, pluralize } from "@/utils/format";
import { BuyRoomSheet } from "./BuyRoomSheet";
import { ProductDrawer } from "./ProductDrawer";
import { RoomViewer } from "./RoomViewer";

export function RoomExperience({
  room,
  styleName,
  products,
  roomCounts,
}: {
  room: RoomSummary;
  styleName: string;
  products: Product[];
  roomCounts: Record<string, number>;
}) {
  const setSelectedRoom = useRoomStore((s) => s.setSelectedRoom);
  const selectedProductId = useRoomStore((s) => s.selectedProductId);
  const selectProduct = useRoomStore((s) => s.selectProduct);
  const [buyOpen, setBuyOpen] = useState(false);
  const hovered = useRef(new Set<string>());

  const productsById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const selected = selectedProductId ? productsById[selectedProductId] ?? null : null;

  useEffect(() => {
    setSelectedRoom(room.id);
    track("room_opened", { roomId: room.id, style: room.styleSlug });
    return () => setSelectedRoom(null);
  }, [room.id, room.styleSlug, setSelectedRoom]);

  const handleSelect = useCallback(
    (productId: string) => {
      selectProduct(productId);
      track("product_clicked", { productId, roomId: room.id });
    },
    [room.id, selectProduct],
  );

  const handleHover = useCallback(
    (productId: string) => {
      if (hovered.current.has(productId)) return; // once per product per visit
      hovered.current.add(productId);
      track("product_hovered", { productId, roomId: room.id });
    },
    [room.id],
  );

  const closeDrawer = useCallback(() => selectProduct(null), [selectProduct]);
  const closeBuy = useCallback(() => setBuyOpen(false), []);

  return (
    <>
      <RoomViewer room={room} productsById={productsById} onSelect={handleSelect} onHover={handleHover} />

      <div className="mt-6 flex flex-col gap-5 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted">{styleName}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tighter md:text-5xl">{room.name}</h1>
          <p className="mt-2 text-muted">{room.blurb}</p>
        </div>
        <div className="flex flex-col gap-4 md:items-end">
          <p className="text-sm text-muted">
            <span className="font-mono text-2xl text-fg tabular-nums">{formatPriceWhole(room.totalCents)}</span>{" "}
            complete, {pluralize(room.productCount, "piece")}
          </p>
          <div className="flex gap-2">
            <Button
              variant="accent"
              size="lg"
              onClick={() => {
                setBuyOpen(true);
                selectProduct(null);
                track("room_bundle_started", { roomId: room.id });
              }}
            >
              Buy room
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => document.getElementById("in-this-room")?.scrollIntoView({ behavior: "smooth" })}
            >
              View products
            </Button>
          </div>
        </div>
      </div>

      <section id="in-this-room" className="scroll-mt-24 py-12">
        <h2 className="text-2xl font-semibold tracking-tight">In this room</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => handleSelect(p.id)}
                className={`flex w-full items-center gap-4 rounded-card border p-3 text-left transition-colors ${
                  selectedProductId === p.id ? "border-fg/50 bg-surface" : "border-line hover:border-fg/30"
                }`}
              >
                <span className="relative size-16 shrink-0 overflow-hidden rounded-[10px] bg-sunken">
                  <Image src={p.image} alt="" fill sizes="64px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block text-sm text-muted">{p.available ? p.color : "Currently unavailable"}</span>
                </span>
                <span className="font-mono text-sm tabular-nums">{formatPrice(p.priceCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ProductDrawer
        product={selected}
        roomId={room.id}
        otherRoomCount={selected ? Math.max((roomCounts[selected.id] ?? 1) - 1, 0) : 0}
        onClose={closeDrawer}
      />
      <BuyRoomSheet open={buyOpen} onClose={closeBuy} room={room} products={products} />
    </>
  );
}
