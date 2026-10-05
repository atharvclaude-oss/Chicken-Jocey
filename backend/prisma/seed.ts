// Loads the frontend's mock catalogue into the database so the API serves the
// same products and rooms the site shows today. Safe to re-run: everything is
// upserted by slug/SKU, and a room's placements are replaced wholesale.
//
// Once the frontend reads from the API, move this data here and delete
// frontend/services/mock-data.ts.

import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { products, rooms, styles } from "../../frontend/services/mock-data.ts";
import { categoryLabels } from "../../frontend/services/products.ts";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { Availability, ProductStatus, RoomStatus } from "../src/generated/prisma/enums.ts";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"]! }),
});

async function main() {
  const categoryIds = new Map<string, string>();
  for (const [i, [slug, name]] of Object.entries(categoryLabels).entries()) {
    const c = await db.category.upsert({
      where: { slug },
      update: { name, sortOrder: i },
      create: { slug, name, sortOrder: i },
    });
    categoryIds.set(slug, c.id);
  }

  const styleIds = new Map<string, string>();
  for (const [i, s] of styles.entries()) {
    const data = { name: s.name, tagline: s.tagline, coverImage: s.coverImage, sortOrder: i };
    const row = await db.style.upsert({ where: { slug: s.slug }, update: data, create: { slug: s.slug, ...data } });
    styleIds.set(s.slug, row.id);
  }

  // Mock product id -> { productId, variantId } in the database.
  const productIds = new Map<string, { productId: string; variantId: string }>();
  for (const p of products) {
    const data = {
      name: p.name,
      description: p.description,
      status: p.available ? ProductStatus.ACTIVE : ProductStatus.OUT_OF_STOCK,
      categoryId: categoryIds.get(p.category)!,
      dimensionsLabel: p.dimensions,
      shippingEstimate: p.shippingEstimate,
    };
    const product = await db.product.upsert({
      where: { slug: p.slug },
      update: data,
      create: { slug: p.slug, ...data },
    });

    await db.productStyle.deleteMany({ where: { productId: product.id } });
    await db.productStyle.createMany({
      data: p.styles.map((slug) => ({ productId: product.id, styleId: styleIds.get(slug)! })),
    });

    const sku = p.slug.toUpperCase();
    const variantData = {
      name: p.color,
      color: p.color,
      priceCents: p.priceCents,
      image: p.image,
      availability: p.available ? Availability.AVAILABLE : Availability.OUT_OF_STOCK,
    };
    const existing = await db.productVariant.findUnique({ where: { sku } });
    const variant = await db.productVariant.upsert({
      where: { sku },
      update: variantData,
      create: { sku, productId: product.id, ...variantData },
    });
    if (existing?.priceCents !== variant.priceCents) {
      await db.retailPriceHistory.create({ data: { variantId: variant.id, priceCents: variant.priceCents } });
    }

    productIds.set(p.id, { productId: product.id, variantId: variant.id });
  }

  for (const [i, r] of rooms.entries()) {
    const styleId = styleIds.get(r.styleSlug)!;
    const data = {
      name: r.name,
      blurb: r.blurb,
      status: RoomStatus.ACTIVE,
      image: r.image,
      imageWidth: r.imageWidth,
      imageHeight: r.imageHeight,
      sortOrder: i,
    };
    const room = await db.room.upsert({
      where: { styleId_slug: { styleId, slug: r.slug } },
      update: data,
      create: { slug: r.slug, styleId, ...data },
    });

    await db.roomProduct.deleteMany({ where: { roomId: room.id } });
    await db.roomProduct.createMany({
      data: r.assets.map((a, sortOrder) => ({
        roomId: room.id,
        ...productIds.get(a.productId)!,
        sceneObjectId: a.assetId,
        hotspotX: a.hotspot.x,
        hotspotY: a.hotspot.y,
        position: [],
        rotation: [],
        sortOrder,
      })),
    });
  }

  console.log(
    `Seeded ${categoryIds.size} categories, ${styleIds.size} styles, ${productIds.size} products, ${rooms.length} rooms.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
