// Runs against DATABASE_URL after `npm run db:seed` (categories and styles). The
// catalogue can be empty, so every product, supplier and room these tests need is
// created here, prefixed "test-", and removed afterwards.
import type { Product, RoomDetail, RoomSummary } from "@shared/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categoryLabels } from "../../frontend/utils/categories.ts";
import { buildApp } from "../src/app.ts";
import { prisma } from "../src/db/client.ts";
import { Availability, BundleTier, ProductStatus, RoomStatus, SupplierPlatform } from "../src/generated/prisma/enums.ts";

const app = await buildApp({ db: prisma });
const get = async <T>(url: string) => {
  const res = await app.inject({ method: "GET", url });
  return { status: res.statusCode, body: res.json() as T };
};
const testOnly = <T extends { slug: string }>(rows: T[]) => rows.filter((r) => r.slug.startsWith("test-"));

const LISTING_URL = "https://www.aliexpress.us/item/3256800000000001.html";

async function cleanup() {
  await prisma.collection.deleteMany({ where: { slug: { startsWith: "test-" } } });
  await prisma.room.deleteMany({ where: { slug: { startsWith: "test-" } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: "test-" } } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: "test-" } } });
}

async function product(
  slug: string,
  category: string,
  styles: string[],
  priceCents: number,
  extra: { status?: ProductStatus; availability?: Availability; color?: string } = {},
) {
  const cat = await prisma.category.findUniqueOrThrow({ where: { slug: category } });
  const styleRows = await prisma.style.findMany({ where: { slug: { in: styles } } });
  return prisma.product.create({
    data: {
      slug,
      name: slug,
      status: extra.status ?? ProductStatus.ACTIVE,
      categoryId: cat.id,
      styles: { create: styleRows.map((s) => ({ styleId: s.id })) },
      variants: {
        create: {
          sku: slug.toUpperCase(),
          priceCents,
          image: `/images/products/${slug}.jpg`,
          color: extra.color ?? "",
          availability: extra.availability ?? Availability.AVAILABLE,
        },
      },
    },
    include: { variants: true },
  });
}

beforeAll(async () => {
  await cleanup();
  const lamp = await product("test-mushroom-lamp", "lighting", ["warm-minimal", "gaming-minimal"], 2499, { color: "Mustard" });
  await product("test-banker-lamp", "lighting", ["dark-academia"], 6400);
  const rug = await product("test-wool-rug", "rugs", ["dark-academia"], 12900);
  await product("test-candle", "decor", ["dark-academia"], 1400, {
    status: ProductStatus.OUT_OF_STOCK,
    availability: Availability.OUT_OF_STOCK,
  });

  const supplier = await prisma.supplier.create({ data: { name: "test-supplier", platform: SupplierPlatform.ALIEXPRESS } });
  await prisma.supplierProduct.create({
    data: {
      variantId: lamp.variants[0]!.id,
      supplierId: supplier.id,
      supplierSku: "test-3256800000000001",
      url: LISTING_URL,
      unitCostCents: 900,
      availability: Availability.AVAILABLE,
    },
  });

  const style = await prisma.style.findUniqueOrThrow({ where: { slug: "dark-academia" } });
  const room = { styleId: style.id, image: "/x.jpg", imageWidth: 1600, imageHeight: 1000 };
  await prisma.room.create({
    data: {
      ...room,
      slug: "test-study",
      name: "Test Study",
      status: RoomStatus.ACTIVE,
      items: {
        create: [lamp, rug].map((p, i) => ({
          productId: p.id,
          variantId: p.variants[0]!.id,
          sceneObjectId: p.slug,
          hotspotX: 50,
          hotspotY: 50,
          position: [],
          rotation: [],
          sortOrder: i,
        })),
      },
    },
  });
  await prisma.room.create({ data: { ...room, slug: "test-archived", name: "Archived", status: RoomStatus.ARCHIVED } });
});

afterAll(async () => {
  await cleanup();
  await app.close();
  await prisma.$disconnect();
});

describe("products", () => {
  it("lists products in the shared Product shape", async () => {
    const { status, body } = await get<Product[]>("/products");
    expect(status).toBe(200);
    expect(testOnly(body).map((p) => p.slug).sort()).toEqual(
      ["test-banker-lamp", "test-candle", "test-mushroom-lamp", "test-wool-rug"],
    );
    const lamp = body.find((p) => p.slug === "test-mushroom-lamp")!;
    expect(lamp).toMatchObject({ priceCents: 2499, category: "lighting", available: true, color: "Mustard" });
    expect(lamp.styles.sort()).toEqual(["gaming-minimal", "warm-minimal"]);
  });

  it("filters by style and category", async () => {
    const { body } = await get<Product[]>("/products?style=dark-academia&category=lighting");
    expect(testOnly(body).map((p) => p.slug)).toEqual(["test-banker-lamp"]);
  });

  it("returns ids in the requested order", async () => {
    const all = testOnly((await get<Product[]>("/products")).body);
    const ids = [all[2]!.id, all[0]!.id, "missing"];
    const { body } = await get<Product[]>(`/products?ids=${ids.join(",")}`);
    expect(body.map((p) => p.id)).toEqual(ids.slice(0, 2));
  });

  it("shows out-of-stock products as unavailable", async () => {
    const { body } = await get<Product>("/products/test-candle");
    expect(body.available).toBe(false);
  });

  it("hides drafts", async () => {
    await product("test-draft-lamp", "lighting", [], 100, { status: ProductStatus.DRAFT });
    expect((await get("/products/test-draft-lamp")).status).toBe(404);
    expect((await get<Product[]>("/products")).body.some((p) => p.slug === "test-draft-lamp")).toBe(false);
  });

  it("404s unknown slugs and 400s bad queries", async () => {
    expect((await get("/products/nope")).status).toBe(404);
    const tooMany = Array.from({ length: 101 }, (_, i) => `id${i}`).join(",");
    expect((await get(`/products?ids=${tooMany}`)).status).toBe(400);
  });
});

describe("rooms", () => {
  it("computes totals from current prices", async () => {
    const { body } = await get<RoomSummary[]>("/rooms?style=dark-academia");
    const study = body.find((r) => r.slug === "test-study")!;
    expect(study.totalCents).toBe(2499 + 12900);
    expect(study.productCount).toBe(2);
    // The scene object id is the glTF productId tag in the baked room.
    expect(study.assets[0]).toMatchObject({ assetId: "test-mushroom-lamp" });
  });

  it("finds rooms containing a product", async () => {
    const lamp = (await get<Product>("/products/test-mushroom-lamp")).body;
    const { body } = await get<RoomSummary[]>(`/rooms?productId=${lamp.id}`);
    expect(body.map((r) => r.slug)).toEqual(["test-study"]);
  });

  it("returns a room with its products and bundles", async () => {
    const room = await prisma.room.findFirstOrThrow({
      where: { slug: "test-study" },
      include: { items: { include: { variant: true }, orderBy: { sortOrder: "asc" } } },
    });
    const starter = room.items.slice(0, 1);
    await prisma.roomBundle.create({
      data: {
        roomId: room.id,
        tier: BundleTier.STARTER,
        name: "test-starter",
        items: { create: starter.map((i) => ({ roomProductId: i.id })) },
      },
    });

    const { status, body } = await get<RoomDetail>("/rooms/dark-academia/test-study");
    expect(status).toBe(200);
    expect(body.products).toHaveLength(2);
    expect(body.bundles).toEqual([
      {
        tier: "starter",
        name: "test-starter",
        productIds: starter.map((i) => i.productId),
        totalCents: starter.reduce((s, i) => s + i.variant.priceCents, 0),
      },
    ]);
    expect((await get("/rooms/warm-minimal/test-study")).status).toBe(404);
  });

  it("hides archived rooms", async () => {
    expect((await get("/rooms/dark-academia/test-archived")).status).toBe(404);
  });
});

describe("catalogue", () => {
  it("serves categories and styles", async () => {
    expect((await get<unknown[]>("/categories")).body).toHaveLength(Object.keys(categoryLabels).length);
    expect((await get<{ slug: string }>("/styles/dark-academia")).body.slug).toBe("dark-academia");
  });

  it("serves only published collections", async () => {
    const rug = await prisma.product.findUniqueOrThrow({ where: { slug: "test-wool-rug" } });
    await prisma.collection.create({
      data: { slug: "test-hidden", name: "Hidden", products: { create: { productId: rug.id } } },
    });
    await prisma.collection.create({
      data: { slug: "test-live", name: "Live", isPublished: true, products: { create: { productId: rug.id } } },
    });
    const list = (await get<{ slug: string }[]>("/collections")).body.map((c) => c.slug);
    expect(list).toContain("test-live");
    expect(list).not.toContain("test-hidden");
    expect((await get<{ products: Product[] }>("/collections/test-live")).body.products[0]!.slug).toBe("test-wool-rug");
    expect((await get("/collections/test-hidden")).status).toBe(404);
  });
});

describe("supplier routing", () => {
  it("keeps supplier details out of public responses", async () => {
    const res = await app.inject({ method: "GET", url: "/products/test-mushroom-lamp" });
    expect(res.body).not.toMatch(/aliexpress|alibaba|unitCost|internalNotes/i);
  });
});

describe("admin", () => {
  const key = "k".repeat(40);

  it("is disabled without a key", async () => {
    expect((await get("/admin/products/test-mushroom-lamp/sourcing")).status).toBe(404);
  });

  it("requires the key and returns the fulfilment listing", async () => {
    const admin = await buildApp({ db: prisma, adminApiKey: key });
    const url = "/admin/products/test-mushroom-lamp/sourcing";
    expect((await admin.inject({ url })).statusCode).toBe(401);
    expect((await admin.inject({ url, headers: { authorization: "Bearer wrong" } })).statusCode).toBe(401);
    const res = await admin.inject({ url, headers: { authorization: `Bearer ${key}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().variants[0].listings[0]).toMatchObject({ platform: "ALIEXPRESS", url: LISTING_URL });
    await admin.close();
  });
});

describe("hardening", () => {
  it("returns JSON 404s for unknown routes", async () => {
    const { status, body } = await get<{ error: string }>("/nope");
    expect(status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("rate limits per client", async () => {
    const limited = await buildApp({ db: prisma, rateLimitMax: 3 });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await limited.inject({ url: "/categories" })).statusCode);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    const res = await limited.inject({ url: "/categories" });
    expect(res.json().error).toMatch(/Rate limit exceeded/);
    expect(res.headers["retry-after"]).toBeDefined();
    // Health checks are exempt so load balancers never get throttled.
    expect((await limited.inject({ url: "/health" })).statusCode).toBe(200);
    await limited.close();
  });
});
