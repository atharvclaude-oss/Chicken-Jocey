"use client";

import { useEffect } from "react";
import { useCart } from "@/store/cart";

/** The order is placed, so the cart that produced it is emptied. */
export function ClearCart() {
  const clear = useCart((s) => s.clear);
  useEffect(() => clear(), [clear]);
  return null;
}
