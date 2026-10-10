// Room products: every object in every 3D room (room-catalog.json). Price, photo, stock and
// delivery come from the same generated CJ offers as the lamps (lamp-offers.ts, written by
// `npm run fetch-cj -- <id> --apply` in backend/ for each CJDROPSHIPPING row in
// backend/data/product-sourcing.tsv). A product with no offer yet is "coming soon":
// clickable in its room and listed in its featured catalogue, but not buyable.
// Supplier ids and costs never reach this file.

import type { Product, ProductCategory } from "@shared/types";
import { lampOffers } from "./lamp-offers";
import roomCatalog from "./room-catalog.json";

interface CatalogEntry {
  id: string;
  name: string;
  category: ProductCategory;
  styles: string[];
  color: string;
  description: string;
  /** The product's own size, when known. */
  dimensions: string;
}

export const catalogProducts: Product[] = (roomCatalog.products as CatalogEntry[]).map((p) => {
  const offer = lampOffers[p.id];
  return {
    id: p.id,
    slug: p.id,
    name: p.name,
    category: p.category,
    styles: p.styles,
    color: p.color,
    description: p.description,
    // Our own measured size only: CJ's boxed size is sometimes placeholder data on furniture.
    dimensions: p.dimensions,
    priceCents: offer?.priceCents ?? 0,
    image: offer?.image ?? "",
    shippingEstimate: offer?.shippingEstimate ?? "",
    available: offer?.available ?? false,
    comingSoon: !offer,
  };
});

/** glTF root node name -> product id, per 3D room. */
export const roomItems = roomCatalog.rooms as Record<string, Record<string, string>>;
