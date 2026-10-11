// Loads the frontend's mock catalogue and 3D rooms into the database so the API
// serves what the site shows today, plus the supplier listing behind each
// product (data/product-sourcing.tsv). Safe to re-run: everything is upserted
// by slug/SKU, and a room's placements are replaced wholesale.
//
// Once the frontend reads from the API, move this data here and delete
// frontend/services/mock-data.ts.

import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { departments, products, styles } from "../../frontend/services/mock-data.ts";
import { scenes } from "../../frontend/services/scenes.ts";
import { categoryLabels } from "../../frontend/utils/categories.ts";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { Availability, ProductStatus, RoomStatus, SupplierPlatform } from "../src/generated/prisma/enums.ts";
import { loadProductSourcing } from "../src/modules/sourcing/sourcing-sheet.ts";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"]! }),
});

async function main() {
  // Parse first: a bad sourcing row should fail before anything is written.
  const sourcing = new Map(loadProductSourcing().map((s) => [s.productSlug, s]));

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
      // Coming-soon pieces (no supplier listing applied yet) stay out of the public catalogue.
      status: p.comingSoon ? ProductStatus.DRAFT : p.available ? ProductStatus.ACTIVE : ProductStatus.OUT_OF_STOCK,
      categoryId: categoryIds.get(p.category)!,
      dimensionsLabel: p.dimensions,
      shippingEstimate: p.shippingEstimate,
      internalNotes: sourcingNotes(sourcing.get(p.slug)),
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

  // Products that left the catalogue can't be bought, even by a hand-made checkout request.
  await db.product.updateMany({
    where: { slug: { notIn: products.map((p) => p.slug) }, status: { in: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK, ProductStatus.PAUSED] } },
    data: { status: ProductStatus.DISCONTINUED },
  });

  // Supplier listings: one marketplace supplier per platform, one listing per product.
  // AliExpress rows are manual purchases: someone buys the matching listing by hand
  // after the customer pays, so it gets a listing too (the search link) and every paid order
  // lands in the admin queue with it. Other searches stay in internalNotes until picked.
  const supplierIds = new Map<SupplierPlatform, string>();
  let listings = 0;
  for (const source of sourcing.values()) {
    const ids = productIds.get(source.productSlug);
    if (!ids) throw new Error(`product-sourcing.tsv: ${source.productSlug} is not a catalogue product`);
    // Every AliExpress row (search or exact item) is bought by hand, so it is orderable as soon as it is listed.
    const manual = source.platform === "ALIEXPRESS";
    const supplierSku = source.supplierSku ?? (manual ? `manual:${source.productSlug}` : null);
    if ((source.kind !== "listing" && !manual) || !supplierSku) {
      await db.supplierProduct.deleteMany({ where: { variantId: ids.variantId } });
      continue;
    }
    const platform = source.platform as SupplierPlatform;
    if (!supplierIds.has(platform)) supplierIds.set(platform, await marketplaceSupplier(platform));
    const supplierId = supplierIds.get(platform)!;

    // Costs stay 0 until filled in sourcing.tsv; UNKNOWN availability keeps
    // fulfilment from ordering an unchecked listing. Imported CJ variants carry
    // live stock, so they are orderable (or out of stock) straight away.
    const checked = manual
      ? // Stock and price are checked by the person buying it, so it is orderable but unverified.
        { availability: Availability.LOW_CONFIDENCE }
      : source.stock === null
        ? {}
        : { availability: source.stock > 0 ? Availability.AVAILABLE : Availability.OUT_OF_STOCK, lastCheckedAt: new Date() };
    const data = {
      variantId: ids.variantId,
      url: source.url,
      unitCostCents: source.unitCostCents ?? 0,
      shippingCostCents: source.shippingCostCents ?? 0,
      priority: 1,
      ...checked,
    };
    const previous = await db.supplierProduct.findUnique({
      where: { supplierId_supplierSku: { supplierId, supplierSku } },
    });
    const listing = await db.supplierProduct.upsert({
      where: { supplierId_supplierSku: { supplierId, supplierSku } },
      update: data,
      create: { supplierId, supplierSku, availability: Availability.UNKNOWN, ...data },
    });
    // Drop listings the sheet no longer routes this variant to.
    await db.supplierProduct.deleteMany({ where: { variantId: ids.variantId, id: { not: listing.id } } });
    if (
      source.unitCostCents !== null &&
      (previous?.unitCostCents !== listing.unitCostCents || previous?.shippingCostCents !== listing.shippingCostCents)
    ) {
      await db.supplierPriceHistory.create({
        data: {
          supplierProductId: listing.id,
          unitCostCents: listing.unitCostCents,
          shippingCostCents: listing.shippingCostCents,
        },
      });
    }
    listings++;
  }

  // Merchandising collections (e.g. the lamp collections), published in catalogue order.
  let collections = 0;
  for (const dept of departments) {
    for (const [i, c] of dept.collections.entries()) {
      const data = { name: c.name, description: c.description, coverImage: c.coverImage, isPublished: true, sortOrder: i };
      const row = await db.collection.upsert({ where: { slug: c.slug }, update: data, create: { slug: c.slug, ...data } });
      await db.collectionProduct.deleteMany({ where: { collectionId: row.id } });
      await db.collectionProduct.createMany({
        data: c.productIds.map((id, position) => {
          const ids = productIds.get(id);
          if (!ids) throw new Error(`mock-data: collection ${c.slug} lists unknown product ${id}`);
          return { collectionId: row.id, productId: ids.productId, position };
        }),
      });
      collections++;
    }
  }

  // 3D rooms. Each tagged object's glTF productId is its scene object id. They
  // have no photo view, so the image is the window view (or the style cover)
  // and hotspots are unused.
  for (const [i, scene] of scenes.entries()) {
    const styleId = styleIds.get(scene.styleSlug);
    if (!styleId) throw new Error(`scenes.ts: ${scene.id} has unknown styleSlug ${scene.styleSlug}`);
    const data = {
      name: scene.name,
      blurb: scene.style,
      status: RoomStatus.ACTIVE,
      image: scene.background ?? styles.find((s) => s.slug === scene.styleSlug)!.coverImage,
      imageWidth: 0,
      imageHeight: 0,
      sortOrder: i,
    };
    const room = await db.room.upsert({
      where: { styleId_slug: { styleId, slug: scene.id } },
      update: data,
      create: { slug: scene.id, styleId, ...data },
    });

    await db.roomProduct.deleteMany({ where: { roomId: room.id } });
    await db.roomProduct.createMany({
      data: scene.productIds.map((productId, sortOrder) => {
        const ids = productIds.get(productId);
        if (!ids) throw new Error(`scenes.ts: ${scene.id} lists unknown product ${productId}`);
        return {
          roomId: room.id,
          ...ids,
          sceneObjectId: productId,
          hotspotX: 0,
          hotspotY: 0,
          position: [],
          rotation: [],
          sortOrder,
        };
      }),
    });
  }

  // Rooms from older seeds (the 2D photo rooms) are archived, not deleted, so
  // links and analytics keep resolving to a 404 rather than a wrong room.
  await db.room.updateMany({
    where: { slug: { notIn: scenes.map((s) => s.id) } },
    data: { status: RoomStatus.ARCHIVED },
  });

  console.log(
    `Seeded ${categoryIds.size} categories, ${styleIds.size} styles, ${productIds.size} products, ` +
      `${listings} supplier listings, ${collections} collections, ${scenes.length} rooms.`,
  );
}

function sourcingNotes(source: ReturnType<typeof loadProductSourcing>[number] | undefined): string {
  if (!source) return "";
  const head =
    source.kind === "search"
      ? `Needs an exact ${source.platform} listing. Search: ${source.url}`
      : `Fulfil from ${source.url}${source.option ? ` (option: ${source.option})` : ""}`;
  return [head, source.notes].filter(Boolean).join("\n");
}

const PLATFORM_NAMES: Record<SupplierPlatform, string> = {
  ALIEXPRESS: "AliExpress",
  ALIBABA: "Alibaba",
  CJDROPSHIPPING: "CJdropshipping",
  DISTRIBUTOR: "Distributor",
  OTHER: "Other",
};

/** One catch-all supplier per marketplace until individual stores are tracked. */
async function marketplaceSupplier(platform: SupplierPlatform): Promise<string> {
  const name = PLATFORM_NAMES[platform];
  const existing = await db.supplier.findFirst({ where: { platform, name } });
  return (existing ?? (await db.supplier.create({ data: { platform, name } }))).id;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
