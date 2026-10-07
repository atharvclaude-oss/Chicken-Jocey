import type { Db } from "../../db/client.ts";
import { Availability } from "../../generated/prisma/enums.ts";

export interface SupplierListingView {
  supplier: string;
  platform: string;
  url: string;
  supplierSku: string;
  unitCostCents: number;
  shippingCostCents: number;
  availability: Availability;
  priority: number;
  lastCheckedAt: string | null;
}

/** Internal view of where a product is bought. Admin only: never expose to customers. */
export interface ProductSourcingView {
  productId: string;
  slug: string;
  name: string;
  variants: {
    variantId: string;
    sku: string;
    priceCents: number;
    listings: SupplierListingView[];
    /** The listing an order is placed with: first by priority among those we trust. */
    fulfilFrom: SupplierListingView | null;
  }[];
  /** Sourcing/QA notes, including the search link when no exact listing is picked yet. */
  internalNotes: string;
}

const ORDERABLE: Availability[] = [Availability.AVAILABLE, Availability.LOW_CONFIDENCE];

export class SourcingService {
  constructor(private db: Db) {}

  async forProduct(slug: string): Promise<ProductSourcingView | null> {
    const product = await this.db.product.findUnique({
      where: { slug },
      include: {
        variants: {
          orderBy: { position: "asc" },
          include: { supplierListings: { orderBy: { priority: "asc" }, include: { supplier: true } } },
        },
      },
    });
    if (!product) return null;
    return {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      internalNotes: product.internalNotes,
      variants: product.variants.map((v) => {
        const listings = v.supplierListings.map((l) => ({
          supplier: l.supplier.name,
          platform: l.supplier.platform,
          url: l.url,
          supplierSku: l.supplierSku,
          unitCostCents: l.unitCostCents,
          shippingCostCents: l.shippingCostCents,
          availability: l.availability,
          priority: l.priority,
          lastCheckedAt: l.lastCheckedAt?.toISOString() ?? null,
        }));
        return {
          variantId: v.id,
          sku: v.sku,
          priceCents: v.priceCents,
          listings,
          fulfilFrom: listings.find((l) => ORDERABLE.includes(l.availability)) ?? null,
        };
      }),
    };
  }
}
