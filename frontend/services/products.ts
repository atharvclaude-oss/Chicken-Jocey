import "server-only";
import type { Product, ProductCategory } from "@shared/types";
import { categoryLabels } from "@/utils/categories";
import { departments, products, styles } from "./mock-data";
import { scenes } from "./scenes";

// Server-only: data access stays on the server, so nothing here (or a future
// API_URL / token) can end up in the browser bundle. Client components import
// display helpers from utils/ instead.
// TODO(backend): replace mock lookups with fetch(`${API_URL}/products/...`).
// Supplier links and costs live in backend/data/product-sourcing.tsv and are
// only served by the backend's key-protected /admin routes.

export { categoryLabels };

/** Copy, so callers can't mutate the mock dataset. */
const toPublic = (product: Product): Product => ({ ...product });

/** Display name for a style slug. Styles are a small fixed list, so this stays sync. */
export const styleName = (slug: string) => styles.find((s) => s.slug === slug)?.name ?? slug;

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

export interface ProductRoom {
  id: string;
  name: string;
}

/** The 3D rooms each product appears in, in carousel order. */
export async function getRoomsByProduct(): Promise<Record<string, ProductRoom[]>> {
  const rooms: Record<string, ProductRoom[]> = {};
  for (const scene of scenes) {
    for (const id of new Set(scene.productIds)) (rooms[id] ??= []).push({ id: scene.id, name: scene.name });
  }
  return rooms;
}

/** How many 3D rooms feature each product. Drives "Also in N other rooms". */
export async function getRoomCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const scene of scenes) {
    for (const id of new Set(scene.productIds)) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Catalogue departments (only Lamps today), each a set of collections. */
export async function getDepartments() {
  return departments.map(({ slug, name, image }) => ({ slug, name, image }));
}

export async function getDepartment(slug: string) {
  return departments.find((d) => d.slug === slug) ?? null;
}

export async function getCollection(departmentSlug: string, collectionSlug: string) {
  const dept = departments.find((d) => d.slug === departmentSlug);
  const collection = dept?.collections.find((c) => c.slug === collectionSlug);
  if (!dept || !collection) return null;
  return { department: dept, collection, products: await getProductsByIds(collection.productIds) };
}

/** Where a product sits in the catalogue, for "back to collection" links. */
export async function getProductHome(productId: string) {
  for (const dept of departments) {
    const collection = dept.collections.find((c) => c.productIds.includes(productId));
    if (collection) return { department: dept.slug, collection: collection.slug, name: collection.name };
  }
  return null;
}
