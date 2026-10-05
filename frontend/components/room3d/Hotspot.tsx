"use client";

import { motion } from "motion/react";
import { formatPrice } from "@/utils/format";

/**
 * Marker for a purchasable object in a scanned room. Purely presentational:
 * the parent wraps it in a button (with the `group/spot` class) and positions
 * it. The name/price label only appears on hover or focus, so the room never
 * looks covered in tags.
 */
export function Hotspot({
  label,
  price,
  active = false,
  delay = 0,
}: {
  label: string;
  price: number;
  active?: boolean;
  delay?: number;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20, delay }}
      className="relative block cursor-pointer"
    >
      <span
        className={`grid size-7 place-items-center rounded-full border backdrop-blur-md transition-all duration-300 ease-out-expo ${
          active
            ? "scale-110 border-accent bg-accent/30"
            : "border-white/60 bg-white/20 group-hover/spot:scale-110 group-hover/spot:border-white group-hover/spot:bg-white/35"
        }`}
      >
        <span className={`size-2.5 rounded-full ${active ? "bg-accent" : "bg-white"}`} />
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-full bg-black/70 px-3 py-1.5 text-xs text-white opacity-0 backdrop-blur-md transition-all duration-300 group-hover/spot:translate-y-0 group-hover/spot:opacity-100 group-focus-visible/spot:opacity-100">
        {label} <span className="ml-1 font-mono text-white/80">{formatPrice(price)}</span>
      </span>
    </motion.span>
  );
}
