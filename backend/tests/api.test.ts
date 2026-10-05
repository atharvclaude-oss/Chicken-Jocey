// Runs against DATABASE_URL after `npm run db:seed`. Rows this file creates are
// prefixed "test-" and removed afterwards.
import type { Product, RoomDetail, RoomSummary } from "@shared/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { prisma } from "../src/db/client.ts";
import { BundleTier, ProductStatus } from "../src/generated/prisma/enums.ts";

const app = await buildApp({ db: prisma });
const get = async <T>(url: string) => {
  const res = await app.inject({ method: "GET", url });
  return { status: res.statusCode, body: res.json() as T };
};

async function cleanup() {
  await prisma.collection.deleteMany({ where: { slug: { startsWith: "test-" } } });
  await prisma.roomBundle.deleteMany({ where: { name: { startsWith: "test-" } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: "test-" } } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await app.close();
  await prisma.$disconnect();
});

describe("products", () => {
  it("lists seeded products in the shared Product shape", async () => {
    const { status, body } = await get<Product[]>("/products");
    expect(status).toBe(200);
    expect(body).toHaveLength(20);
    const lamp = body.find((p) => p.slug === "mushroom-lamp")!;
    expect(lamp).toMatchObject({ priceCents: 2499, category: "lighting", available: true, color: "Mustard" });
    expect(lamp.styles.sort()).toEqual(["gaming-minimal", "warm-minimal"]);
  });

  it("filters by style and category", async () => {
    const { body } = await get<Product[]>("/products?style=dark-academia&category=lighting");
    expect(body.map((p) => p.slug).sort()).toEqual(["banker-lamp", "edison-globe-lamp"]);
  });

  it("returns ids in the requested order", async () => {
    const all = (await get<Product[]>("/products")).body;
    const ids = [all[3]!.id, all[0]!.id, "missing"];
    const { body } = await get<Product[]>(`/products?ids=${ids.join(",")}`);
    expect(body.map((p) => p.id)).toEqual(ids.slice(0, 2));
  });

  it("shows out-of-stock products as unavailable", async () => {
    const { body } = await get<Product>("/products/pillar-candle");
    expect(body.available).toBe(false);
  });

  it("hides drafts", async () => {
    const lighting = await prisma.category.findUniqueOrThrow({ where: { slug: "lighting" } });
    await prisma.product.create({
      data: {
        slug: "test-draft-lamp",
        name: "Draft",
        status: ProductStatus.DRAFT,
        categoryId: lighting.id,
        variants: { create: { sku: "TEST-DRAFT-LAMP", priceCents: 100, image: "/x.jpg" } },
      },
    });
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
    const { body } = await get<RoomSummary[]>("/rooms?style=sleek-masculine");
    const midnight = body.find((r) => r.slug === "midnight-minimal")!;
    // swing-arm lamp 4600 + pillow + rug, straight from the seeded variants.
    const prices = await prisma.roomProduct.findMany({
      where: { room: { slug: "midnight-minimal" } },
      include: { variant: true },
    });
    expect(midnight.totalCents).toBe(prices.reduce((s, p) => s + p.variant.priceCents, 0));
    expect(midnight.productCount).toBe(3);
    expect(midnight.assets[0]).toMatchObject({ assetId: "midnight-minimal-01", hotspot: { x: 48, y: 41 } });
  });

  it("finds rooms containing a product", async () => {
    const atlas = (await get<Product>("/products/leather-atlas")).body;
    const { body } = await get<RoomSummary[]>(`/rooms?productId=${atlas.id}`);
    expect(body.map((r) => r.slug).sort()).toEqual(["night-library", "reading-room", "writers-desk"]);
  });

  it("returns a room with its products and bundles", async () => {
    const room = await prisma.room.findFirstOrThrow({
      where: { slug: "monochrome-setup" },
      include: { items: { include: { variant: true }, orderBy: { sortOrder: "asc" } } },
    });
    const starter = room.items.slice(0, 2);
    await prisma.roomBundle.create({
      data: {
        roomId: room.id,
        tier: BundleTier.STARTER,
        name: "test-starter",
        items: { create: starter.map((i) => ({ roomProductId: i.id })) },
      },
    });

    const { status, body } = await get<RoomDetail>("/rooms/gaming-minimal/monochrome-setup");
    expect(status).toBe(200);
    expect(body.products).toHaveLength(4);
    expect(body.bundles).toEqual([
      {
        tier: "starter",
        name: "test-starter",
        productIds: starter.map((i) => i.productId),
        totalCents: starter.reduce((s, i) => s + i.variant.priceCents, 0),
      },
    ]);
    expect((await get("/rooms/warm-minimal/monochrome-setup")).status).toBe(404);
  });
});

describe("catalogue", () => {
  it("serves categories and styles", async () => {
    expect((await get<unknown[]>("/categories")).body).toHaveLength(6);
    expect((await get<{ slug: string }>("/styles/dark-academia")).body.slug).toBe("dark-academia");
  });

  it("serves only published collections", async () => {
    const rug = await prisma.product.findUniqueOrThrow({ where: { slug: "woven-wool-rug" } });
    await prisma.collection.create({
      data: { slug: "test-hidden", name: "Hidden", products: { create: { productId: rug.id } } },
    });
    await prisma.collection.create({
      data: { slug: "test-live", name: "Live", isPublished: true, products: { create: { productId: rug.id } } },
    });
    const list = (await get<{ slug: string }[]>("/collections")).body.map((c) => c.slug);
    expect(list).toContain("test-live");
    expect(list).not.toContain("test-hidden");
    expect((await get<{ products: Product[] }>("/collections/test-live")).body.products[0]!.slug).toBe(
      "woven-wool-rug",
    );
    expect((await get("/collections/test-hidden")).status).toBe(404);
  });
});
