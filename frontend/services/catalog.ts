// The product catalogue: every object in every 3D room (room-catalog.json),
// merged with the public half of its CJdropshipping listing (catalog-offers.json,
// written by backend `npm run cj:apply`). A product with no offer yet is
// "coming soon": clickable in the room, shown in the catalogue, not buyable.
// Supplier ids and costs are never in either file (backend/data/cj-listings.tsv).

import type { Product, ProductCategory } from "@shared/types";
import roomCatalog from "./room-catalog.json";
import offers from "./catalog-offers.json";

export interface CatalogOffer {
  priceCents: number;
  image: string;
  shippingEstimate: string;
  available: boolean;
  /** Variant actually sold, e.g. "Black / 27 in". */
  color?: string;
  dimensions?: string;
}

interface CatalogEntry {
  id: string;
  name: string;
  category: ProductCategory;
  styles: string[];
  color: string;
  description: string;
  dimensions: string;
}

const offerFor = (id: string) => (offers as Record<string, CatalogOffer>)[id];

export const catalogProducts: Product[] = (roomCatalog.products as CatalogEntry[]).map((p) => {
  const offer = offerFor(p.id);
  return {
    id: p.id,
    slug: p.id,
    name: p.name,
    category: p.category,
    styles: p.styles,
    color: offer?.color || p.color,
    description: p.description,
    dimensions: offer?.dimensions || p.dimensions,
    priceCents: offer?.priceCents ?? 0,
    image: offer?.image ?? "",
    shippingEstimate: offer?.shippingEstimate ?? "",
    available: offer?.available ?? false,
    comingSoon: !offer,
  };
});

/** glTF root node name -> product id, per 3D room. */
export const roomItems = roomCatalog.rooms as Record<string, Record<string, string>>;
