import type { Product, ProductCategory } from "@shared/types";
import { products, rooms, styles } from "./mock-data";

// TODO(backend): replace mock lookups with fetch(`${API_URL}/products/...`).

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
  return products.filter(
    (p) =>
      (!filters.style || p.styles.includes(filters.style)) &&
      (!filters.category || p.category === filters.category),
  );
}

export async function getProduct(slug: string): Promise<Product | null> {
  return products.find((p) => p.slug === slug) ?? null;
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  return ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p));
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
