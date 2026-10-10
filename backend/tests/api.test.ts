// Runs against DATABASE_URL after `npm run db:seed`. Rows this file creates are
// prefixed "test-" and removed afterwards.
import type { Product, RoomDetail, RoomSummary } from "@shared/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { products as mockProducts } from "../../frontend/services/mock-data.ts";
import { categoryLabels } from "../../frontend/utils/categories.ts";
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
    expect(body).toHaveLength(mockProducts.length);
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
    const lounge = body.find((r) => r.slug === "sleek-lounge-01")!;
    const prices = await prisma.roomProduct.findMany({
      where: { room: { slug: "sleek-lounge-01" } },
      include: { variant: true },
    });
    expect(lounge.totalCents).toBe(prices.reduce((s, p) => s + p.variant.priceCents, 0));
    expect(lounge.productCount).toBe(4);
    // The scene object id is the glTF productId tag in the baked room.
    expect(lounge.assets[0]).toMatchObject({ assetId: "oak-gallery-frame" });
  });

  it("finds rooms containing a product", async () => {
    const frame = (await get<Product>("/products/oak-gallery-frame")).body;
    const { body } = await get<RoomSummary[]>(`/rooms?productId=${frame.id}`);
    expect(body.map((r) => r.slug).sort()).toEqual(["sleek-lounge-01", "zeke-bedroom-01"]);
  });

  it("returns a room with its products and bundles", async () => {
    const room = await prisma.room.findFirstOrThrow({
      where: { slug: "zeke-bedroom-01" },
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

    const { status, body } = await get<RoomDetail>("/rooms/gaming-minimal/zeke-bedroom-01");
    expect(status).toBe(200);
    expect(body.products).toHaveLength(6);
    expect(body.bundles).toEqual([
      {
        tier: "starter",
        name: "test-starter",
        productIds: starter.map((i) => i.productId),
        totalCents: starter.reduce((s, i) => s + i.variant.priceCents, 0),
      },
    ]);
    expect((await get("/rooms/warm-minimal/zeke-bedroom-01")).status).toBe(404);
  });

  it("hides archived rooms", async () => {
    expect((await get("/rooms/gaming-minimal/monochrome-setup")).status).toBe(404);
  });
});

describe("catalogue", () => {
  it("serves categories and styles", async () => {
    expect((await get<unknown[]>("/categories")).body).toHaveLength(Object.keys(categoryLabels).length);
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

describe("supplier routing", () => {
  it("routes every product in a 3D room to a supplier", async () => {
    const rooms = (await get<RoomSummary[]>("/rooms")).body;
    const productIds = new Set(rooms.flatMap((r) => r.assets.map((a) => a.productId)));
    expect(productIds.size).toBeGreaterThan(0);
    const routed = await prisma.product.findMany({
      where: { id: { in: [...productIds] } },
      include: { variants: { include: { supplierListings: true } } },
    });
    for (const p of routed) {
      const listed = p.variants.some((v) => v.supplierListings.length > 0);
      // Either an exact listing, or a search link recorded for the sourcing team.
      expect(listed || p.internalNotes.startsWith("Needs an exact"), p.slug).toBe(true);
    }
  });

  it("keeps supplier details out of public responses", async () => {
    const res = await app.inject({ method: "GET", url: "/products/gaming-chair" });
    expect(res.body).not.toMatch(/aliexpress|alibaba|unitCost|internalNotes/i);
  });
});

describe("admin", () => {
  const key = "k".repeat(40);

  it("is disabled without a key", async () => {
    expect((await get("/admin/products/gaming-chair/sourcing")).status).toBe(404);
  });

  it("requires the key and returns the fulfilment listing", async () => {
    const admin = await buildApp({ db: prisma, adminApiKey: key });
    const url = "/admin/products/gaming-chair/sourcing";
    expect((await admin.inject({ url })).statusCode).toBe(401);
    expect((await admin.inject({ url, headers: { authorization: "Bearer wrong" } })).statusCode).toBe(401);
    const res = await admin.inject({ url, headers: { authorization: `Bearer ${key}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().variants[0].listings[0]).toMatchObject({
      platform: "ALIEXPRESS",
      url: "https://www.aliexpress.us/item/3256808049031703.html",
    });
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
