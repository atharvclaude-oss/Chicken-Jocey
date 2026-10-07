"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, Product, RoomSummary } from "@shared/types";

// Cart lives client-side until the backend cart API exists. Prices stored here
// are display snapshots; checkout must re-price on the server.

type ProductLine = Extract<CartItem, { kind: "product" }>;

/** Per-line cap; keeps a stuck key or bad input from creating absurd orders. */
export const MAX_QUANTITY = 10;

const clampQuantity = (n: number) => (Number.isFinite(n) ? Math.min(MAX_QUANTITY, Math.max(0, Math.floor(n))) : 0);

type BundleLine = Extract<CartItem, { kind: "bundle" }>;

interface CartState {
  items: CartItem[];
  /**
   * Puts `quantity` of a product in the cart. If it's already there, its
   * quantity is set rather than stacked, so a double click can't add it twice.
   */
  addProduct: (product: Product, source: ProductLine["source"], quantity?: number) => void;
  addBundle: (room: RoomSummary, products: Product[]) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeProduct: (productId: string) => void;
  removeBundle: (roomId: string) => void;
  removeFromBundle: (roomId: string, productId: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addProduct: (product, source, quantity = 1) =>
        set((state) => {
          const qty = Math.max(1, clampQuantity(quantity));
          const exists = state.items.some((i) => i.kind === "product" && i.productId === product.id);
          if (exists) {
            return {
              items: state.items.map((i) =>
                i.kind === "product" && i.productId === product.id ? { ...i, quantity: qty } : i,
              ),
            };
          }
          const line: ProductLine = {
            kind: "product",
            productId: product.id,
            name: product.name,
            image: product.image,
            priceCents: product.priceCents,
            quantity: qty,
            source,
          };
          return { items: [...state.items, line] };
        }),
      addBundle: (room, products) =>
        set((state) => {
          const line: BundleLine = {
            kind: "bundle",
            roomId: room.id,
            roomName: room.name,
            image: room.image,
            products: products.map((p) => ({
              productId: p.id,
              name: p.name,
              priceCents: p.priceCents,
            })),
          };
          // Re-adding a room replaces its previous selection.
          const rest = state.items.filter((i) => !(i.kind === "bundle" && i.roomId === room.id));
          return { items: [...rest, line] };
        }),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items
            .map((i) =>
              i.kind === "product" && i.productId === productId ? { ...i, quantity: clampQuantity(quantity) } : i,
            )
            .filter((i) => i.kind !== "product" || i.quantity > 0),
        })),
      removeProduct: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => !(i.kind === "product" && i.productId === productId)),
        })),
      removeBundle: (roomId) =>
        set((state) => ({
          items: state.items.filter((i) => !(i.kind === "bundle" && i.roomId === roomId)),
        })),
      removeFromBundle: (roomId, productId) =>
        set((state) => ({
          items: state.items
            .map((i) =>
              i.kind === "bundle" && i.roomId === roomId
                ? { ...i, products: i.products.filter((p) => p.productId !== productId) }
                : i,
            )
            .filter((i) => i.kind !== "bundle" || i.products.length > 0),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: "roomcommerce-cart" },
  ),
);

export function lineTotal(item: CartItem) {
  return item.kind === "product"
    ? item.priceCents * item.quantity
    : item.products.reduce((sum, p) => sum + p.priceCents, 0);
}

export function lineCount(item: CartItem) {
  return item.kind === "product" ? item.quantity : item.products.length;
}
