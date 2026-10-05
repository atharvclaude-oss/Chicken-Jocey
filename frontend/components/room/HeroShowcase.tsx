"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import type { Product } from "@shared/types";
import { formatPrice } from "@/utils/format";
import { Hotspot } from "./Hotspot";

export interface ShowcaseSpot {
  product: Product;
  x: number;
  y: number;
}

/** Homepage hero image with live hotspots, so the concept is felt before it is read. */
export function HeroShowcase({ image, spots }: { image: string; spots: ShowcaseSpot[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className="relative aspect-[3/2] overflow-hidden rounded-card bg-stage"
    >
      <Image
        src={image}
        alt="A navy bedroom with rust bedding, a brick column and a wall lamp"
        fill
        preload
        sizes="(min-width: 1024px) 55vw, 100vw"
        className="object-cover"
      />
      {spots.map((s, i) => (
        <Link
          key={s.product.id}
          href={`/products/${s.product.slug}`}
          className="group/spot absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%` }}
          aria-label={`${s.product.name}, ${formatPrice(s.product.priceCents)}`}
        >
          <Hotspot label={s.product.name} price={s.product.priceCents} delay={0.6 + i * 0.15} />
        </Link>
      ))}
    </motion.div>
  );
}
