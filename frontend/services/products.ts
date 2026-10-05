import type { Product, ProductCategory, SupplierListing } from "@shared/types";
import { products, rooms, styles } from "./mock-data";

// TODO(backend): replace mock lookups with fetch(`${API_URL}/products/...`).

/**
 * Everything returned from this module may be rendered or serialized to the
 * browser, so supplier details (where we buy, what we pay) are stripped.
 * Use getSupplierListing() on the server for fulfilment.
 */
const toPublic = (product: Product): Product => {
  const copy = { ...product };
  delete copy.supplier;
  return copy;
};

/** Internal only: supplier listing for fulfilment. Never pass to client components. */
export async function getSupplierListing(productId: string): Promise<SupplierListing | null> {
  return products.find((p) => p.id === productId)?.supplier ?? null;
}

/** Display name for a style slug. Styles are a small fixed list, so this stays sync. */
export const styleName = (slug: string) => styles.find((s) => s.slug === slug)?.name ?? slug;

export const categoryLabels: Record<ProductCategory, string> = {
  lighting: "Lighting",
  "wall-art": "Wall Art",
  rugs: "Rugs",
  desk: "Desk",
  decor: "Decor",
  seating: "Seating",
};

export interface ProductFilters {
  style?: string;
  category?: ProductCategory;
}

export async function getProducts(filters: ProductFilters = {}): Promise<Product[]> {
  return products
    .filter(
      (p) =>
        (!filters.style || p.styles.includes(filters.style)) &&
        (!filters.category || p.category === filters.category),
    )
    .map(toPublic);
}

export async function getProduct(slug: string): Promise<Product | null> {
  const product = products.find((p) => p.slug === slug);
  return product ? toPublic(product) : null;
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  return ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p))
    .map(toPublic);
}

/** How many rooms feature each product. Drives "Also in N other rooms". */
export async function getRoomCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const r of rooms) {
    for (const id of new Set(r.assets.map((a) => a.productId))) {
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}
