import type { Product, ProductCategory } from "../../../../shared/types.ts";
import type { Db } from "../../db/client.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { Availability, ProductStatus } from "../../generated/prisma/enums.ts";

/** Statuses customers can see. PAUSED and OUT_OF_STOCK render as unavailable. */
export const PUBLIC_STATUSES = [
  ProductStatus.ACTIVE,
  ProductStatus.PAUSED,
  ProductStatus.OUT_OF_STOCK,
];

const SELLABLE_AVAILABILITY: Availability[] = [Availability.AVAILABLE, Availability.LOW_CONFIDENCE];

/** Everything needed to turn a Product row into the public API shape. */
export const publicProductInclude = {
  category: true,
  styles: { include: { style: true } },
  variants: { orderBy: { position: "asc" }, take: 1 },
} satisfies Prisma.ProductInclude;

export type ProductRow = Prisma.ProductGetPayload<{ include: typeof publicProductInclude }>;

type VariantRow = ProductRow["variants"][number];

/**
 * Public API shape. Price, image and color come from the default variant
 * unless `override` is given (e.g. the specific variant placed in a room).
 */
export function toPublicProduct(
  row: Omit<ProductRow, "variants"> & { variants?: VariantRow[] },
  override?: VariantRow,
): Product {
  const variant = override ?? row.variants?.[0];
  if (!variant) throw new Error(`Product ${row.id} has no variants`);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    priceCents: variant.priceCents,
    image: variant.image,
    category: row.category.slug as ProductCategory,
    styles: row.styles.map((s) => s.style.slug),
    color: variant.color,
    description: row.description,
    dimensions: row.dimensionsLabel,
    shippingEstimate: row.shippingEstimate,
    available:
      row.status === ProductStatus.ACTIVE && SELLABLE_AVAILABILITY.includes(variant.availability),
  };
}

export interface ProductFilters {
  style?: string;
  category?: string;
  ids?: string[];
}

export class ProductService {
  constructor(private db: Db) {}

  async list(filters: ProductFilters = {}): Promise<Product[]> {
    const rows = await this.db.product.findMany({
      where: {
        status: { in: PUBLIC_STATUSES },
        // A product without variants is a data error; hide it rather than 500.
        variants: { some: {} },
        ...(filters.category && { category: { slug: filters.category } }),
        ...(filters.style && { styles: { some: { style: { slug: filters.style } } } }),
        ...(filters.ids && { id: { in: filters.ids } }),
      },
      include: publicProductInclude,
      orderBy: { createdAt: "asc" },
    });
    const products = rows.map((r) => toPublicProduct(r));
    if (!filters.ids) return products;
    // Keep the caller's order, which the cart relies on.
    const byId = new Map(products.map((p) => [p.id, p]));
    return filters.ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
  }

  async getBySlug(slug: string): Promise<Product | null> {
    const row = await this.db.product.findFirst({
      where: { slug, status: { in: PUBLIC_STATUSES }, variants: { some: {} } },
      include: publicProductInclude,
    });
    return row ? toPublicProduct(row) : null;
  }
}
