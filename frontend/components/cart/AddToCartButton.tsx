"use client";

import { useEffect, useState } from "react";
import { Check } from "@phosphor-icons/react";
import type { CartItem, Product } from "@shared/types";
import { Button, ButtonLink } from "@/components/common/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { useCart } from "@/store/cart";
import { track } from "@/utils/analytics";
import { QuantityStepper } from "./QuantityStepper";

/**
 * Quantity picker + add button. Once the product is in the cart the button
 * turns into "In cart · View" and the stepper edits the cart line directly,
 * so repeated clicks never add the product twice.
 */
export function AddToCartButton({
  product,
  source,
  roomId,
  className = "",
  size = "lg",
}: {
  product: Product;
  source: "room" | "catalogue";
  roomId?: string;
  className?: string;
  size?: "md" | "lg";
}) {
  const hydrated = useHydrated();
  const addProduct = useCart((s) => s.addProduct);
  const setQuantity = useCart((s) => s.setQuantity);
  const inCart = useCart((s) =>
    s.items.find(
      (i): i is Extract<CartItem, { kind: "product" }> => i.kind === "product" && i.productId === product.id,
    ),
  );
  const [quantity, setLocalQuantity] = useState(1);
  // Brief "Added" state after a click: confirms the add, and stops a double
  // click from landing on the "View cart" link that replaces the button.
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(false), 1200);
    return () => clearTimeout(t);
  }, [justAdded]);

  if (!product.available) {
    return (
      <Button size={size} variant="secondary" disabled className={className}>
        Currently unavailable
      </Button>
    );
  }

  // The cart lives in localStorage, so it's unknown until hydration.
  const line = hydrated ? inCart : undefined;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {line ? (
        <>
          <QuantityStepper
            label={product.name}
            size={size}
            value={line.quantity}
            onChange={(next) => {
              setQuantity(product.id, next);
              track("cart_quantity_updated", { productId: product.id, quantity: next, roomId });
            }}
          />
          {justAdded ? (
            <Button size={size} className="flex-1" aria-disabled tabIndex={-1}>
              <Check size={16} weight="bold" /> Added to cart
            </Button>
          ) : (
            <ButtonLink href="/cart" size={size} variant="secondary" className="flex-1">
              <Check size={16} weight="bold" /> In cart · View
            </ButtonLink>
          )}
        </>
      ) : (
        <>
          <QuantityStepper label={product.name} size={size} value={quantity} onChange={setLocalQuantity} />
          <Button
            size={size}
            className="flex-1"
            disabled={!hydrated}
            onClick={() => {
              addProduct(product, source, quantity);
              setJustAdded(true);
              track(source === "room" ? "product_added_from_room" : "product_added_from_catalogue", {
                productId: product.id,
                roomId,
                quantity,
                priceCents: product.priceCents,
              });
            }}
          >
            Add to cart
          </Button>
        </>
      )}
    </div>
  );
}
