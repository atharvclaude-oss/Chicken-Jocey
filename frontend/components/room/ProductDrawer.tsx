"use client";

import Link from "next/link";
import { Truck } from "@phosphor-icons/react";
import type { Product } from "@shared/types";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { ProductImage } from "@/components/catalogue/ProductImage";
import { buttonClass } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";
import { categoryLabels } from "@/utils/categories";
import { formatPrice, pluralize } from "@/utils/format";

export function ProductDrawer({
  product,
  roomId,
  otherRoomCount,
  onClose,
}: {
  product: Product | null;
  roomId: string;
  otherRoomCount: number;
  onClose: () => void;
}) {
  return (
    <Panel
      open={product !== null}
      onClose={onClose}
      title={product ? categoryLabels[product.category] : "Product"}
      footer={
        product && (
          <div className="space-y-2">
            {product.comingSoon ? (
              <p className="rounded-control bg-sunken px-4 py-3 text-center text-sm text-muted">
                Being sourced. You&apos;ll be able to buy this exact piece soon.
              </p>
            ) : (
              <AddToCartButton product={product} source="room" roomId={roomId} className="w-full" />
            )}
            <Link href={`/products/${product.slug}`} className={buttonClass({ variant: "ghost", size: "md", className: "w-full" })}>
              View details
            </Link>
          </div>
        )
      }
    >
      {product && (
        <div key={product.id}>
          <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-sunken">
            <ProductImage product={product} sizes="420px" />
          </div>
          <div className="mt-5 flex items-start justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">{product.name}</h2>
            <p className="pt-1 font-mono text-lg tabular-nums">{product.comingSoon ? "Soon" : product.priceCents > 0 ? formatPrice(product.priceCents) : "Price soon"}</p>
          </div>
          {product.color && <p className="mt-1 text-sm text-muted">{product.color}</p>}

          {product.comingSoon ? null : product.available ? (
            <p className="mt-4 inline-flex items-center gap-2 text-sm">
              <Truck size={18} className="text-muted" /> {product.shippingEstimate}
            </p>
          ) : (
            <p className="mt-4 rounded-control bg-sunken px-3 py-2.5 text-sm">
              Currently unavailable.{" "}
              <Link href="/catalogue" className="font-medium underline underline-offset-4">
                See similar {categoryLabels[product.category].toLowerCase()}
              </Link>
            </p>
          )}

          <p className="mt-4 leading-relaxed text-muted">{product.description}</p>
          {product.dimensions && (
            <dl className="mt-5 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Dimensions</dt>
              <dd>{product.dimensions}</dd>
            </dl>
          )}

          {otherRoomCount > 0 && (
            <Link
              href={`/products/${product.slug}#in-rooms`}
              className="mt-6 block rounded-control border border-line px-4 py-3 text-sm transition-colors hover:border-fg/40"
            >
              Also used in {pluralize(otherRoomCount, "other room")}
              <span className="float-right text-muted">See them</span>
            </Link>
          )}
        </div>
      )}
    </Panel>
  );
}
