import type {
  BundleTier,
  Product,
  RoomAsset,
  RoomDetail,
  RoomSummary,
} from "../../../../shared/types.ts";
import type { Db } from "../../db/client.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { RoomStatus } from "../../generated/prisma/enums.ts";
import { PUBLIC_STATUSES, toPublicProduct } from "../products/products.service.ts";

const roomInclude = {
  style: true,
  items: {
    // Products that are drafts or discontinued silently drop out of the room.
    where: { product: { status: { in: PUBLIC_STATUSES } } },
    orderBy: { sortOrder: "asc" },
    include: {
      product: { include: { category: true, styles: { include: { style: true } } } },
      variant: { include: { modelAsset: true } },
    },
  },
  bundles: { include: { items: true } },
} satisfies Prisma.RoomInclude;

type RoomRow = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;

const BUNDLE_ORDER: BundleTier[] = ["starter", "standard", "complete"];

/**
 * Totals are always computed from current variant prices, never stored, so a
 * price change shows up in every room immediately.
 */
function toSummary(room: RoomRow): RoomSummary {
  const assets: RoomAsset[] = room.items.map((item) => ({
    productId: item.productId,
    assetId: item.sceneObjectId,
    hotspot: { x: item.hotspotX, y: item.hotspotY },
    variantId: item.variantId,
    modelUrl: item.variant.modelAsset?.url ?? null,
    position: item.position,
    rotation: item.rotation,
  }));
  return {
    id: room.id,
    slug: room.slug,
    styleSlug: room.style.slug,
    name: room.name,
    blurb: room.blurb,
    image: room.image,
    imageWidth: room.imageWidth,
    imageHeight: room.imageHeight,
    assets,
    totalCents: room.items.reduce((sum, item) => sum + item.variant.priceCents, 0),
    productCount: assets.length,
  };
}

function toDetail(room: RoomRow): RoomDetail {
  const products = new Map<string, Product>();
  for (const item of room.items) {
    if (!products.has(item.productId)) {
      products.set(item.productId, toPublicProduct(item.product, item.variant));
    }
  }

  const itemsById = new Map(room.items.map((i) => [i.id, i]));
  const bundles = room.bundles
    .map((bundle) => {
      const items = bundle.items
        .map((bi) => itemsById.get(bi.roomProductId))
        .filter((i): i is NonNullable<typeof i> => Boolean(i));
      return {
        tier: bundle.tier.toLowerCase() as BundleTier,
        name: bundle.name,
        productIds: items.map((i) => i.productId),
        totalCents: items.reduce((sum, i) => sum + i.variant.priceCents, 0),
      };
    })
    .sort((a, b) => BUNDLE_ORDER.indexOf(a.tier) - BUNDLE_ORDER.indexOf(b.tier));

  return { ...toSummary(room), products: [...products.values()], bundles };
}

export interface RoomFilters {
  style?: string;
  productId?: string;
}

export class RoomService {
  constructor(private db: Db) {}

  async list(filters: RoomFilters = {}): Promise<RoomSummary[]> {
    const rows = await this.db.room.findMany({
      where: {
        status: RoomStatus.ACTIVE,
        ...(filters.style && { style: { slug: filters.style } }),
        ...(filters.productId && {
          items: {
            some: {
              productId: filters.productId,
              product: { status: { in: PUBLIC_STATUSES } },
            },
          },
        }),
      },
      include: roomInclude,
      orderBy: [{ style: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });
    return rows.map(toSummary);
  }

  async get(styleSlug: string, roomSlug: string): Promise<RoomDetail | null> {
    const row = await this.db.room.findFirst({
      where: { slug: roomSlug, status: RoomStatus.ACTIVE, style: { slug: styleSlug } },
      include: roomInclude,
    });
    return row ? toDetail(row) : null;
  }
}
