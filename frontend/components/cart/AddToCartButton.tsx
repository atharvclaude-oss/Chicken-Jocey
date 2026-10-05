"use client";

import { useEffect, useState } from "react";
import { Check } from "@phosphor-icons/react";
import type { Product } from "@shared/types";
import { Button } from "@/components/common/Button";
import { useCart } from "@/store/cart";
import { track } from "@/utils/analytics";

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
  const addProduct = useCart((s) => s.addProduct);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 1600);
    return () => clearTimeout(t);
  }, [added]);

  if (!product.available) {
    return (
      <Button size={size} variant="secondary" disabled className={className}>
        Currently unavailable
      </Button>
    );
  }

  return (
    <Button
      size={size}
      className={className}
      onClick={() => {
        addProduct(product, source);
        setAdded(true);
        track(source === "room" ? "product_added_from_room" : "product_added_from_catalogue", {
          productId: product.id,
          roomId,
          priceCents: product.priceCents,
        });
      }}
    >
      {added ? (
        <>
          <Check size={16} weight="bold" /> Added to cart
        </>
      ) : (
        "Add to cart"
      )}
    </Button>
  );
}
