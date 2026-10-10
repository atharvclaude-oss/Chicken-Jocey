import Image from "next/image";
import type { Product } from "@shared/types";
import { categoryLabels } from "@/utils/categories";

/**
 * The product's photo, or (until its supplier listing is linked) a quiet
 * placeholder with the category, so coming-soon pieces still sit in the grid.
 * Fills its positioned parent.
 */
export function ProductImage({
  product,
  sizes,
  preload = false,
  className = "object-cover",
}: {
  product: Product;
  sizes: string;
  preload?: boolean;
  className?: string;
}) {
  if (product.image) {
    return <Image src={product.image} alt={product.name} fill sizes={sizes} preload={preload} className={className} />;
  }
  return (
    <div className="absolute inset-0 grid place-items-center bg-sunken">
      <div className="px-4 text-center">
        <p className="text-[13px] text-muted">{categoryLabels[product.category]}</p>
        <p className="mt-1 text-sm text-fg/80">Photo coming soon</p>
      </div>
    </div>
  );
}
