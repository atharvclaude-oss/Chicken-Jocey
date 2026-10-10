import Link from "next/link";
import type { Product } from "@shared/types";
import { styleName } from "@/services/products";
import { categoryLabels } from "@/utils/categories";
import { formatPrice } from "@/utils/format";
import { roomHref } from "@/utils/routes";
import { ProductImage } from "./ProductImage";

export function ProductCard({
  product,
  roomId,
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw",
}: {
  product: Product;
  /** A 3D room featuring this product; adds a "View in room" link. */
  roomId?: string;
  sizes?: string;
}) {
  return (
    <article className="group relative">
      <Link href={`/products/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-sunken">
          <ProductImage
            product={product}
            sizes={sizes}
            className="object-cover transition-transform duration-700 ease-out-expo group-hover:scale-[1.03]"
          />
          {!product.available && !product.comingSoon && (
            <div className="absolute inset-x-0 bottom-0 bg-scrim px-3 py-2 text-xs font-medium text-white backdrop-blur-sm">
              Currently unavailable
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <h3 className="text-[15px] font-medium leading-snug">{product.name}</h3>
          <p className="shrink-0 font-mono text-sm tabular-nums">{product.comingSoon ? "Soon" : product.priceCents > 0 ? formatPrice(product.priceCents) : "Price soon"}</p>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          {[product.styles[0] && styleName(product.styles[0]), categoryLabels[product.category]].filter(Boolean).join(" · ")}
        </p>
      </Link>
      {roomId && (
        <Link
          href={roomHref(roomId, product.id)}
          className="mt-2 inline-block text-[13px] font-medium text-accent underline-offset-4 hover:underline"
        >
          View in room
        </Link>
      )}
    </article>
  );
}
