// CJdropshipping adapter and import plumbing, with CJ's API stubbed (no network).
import { afterEach, describe, expect, it, vi } from "vitest";
import { floorRetailCents } from "../src/modules/pricing/pricing.ts";
import { parseCjVariants, parsePriceSheet, parseProductSourcing } from "../src/modules/sourcing/sourcing-sheet.ts";
import { CjClient } from "../src/modules/suppliers/cj.ts";
import { CjSupplierAdapter } from "../src/modules/suppliers/cj-adapter.ts";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { catalogueJpeg, deliveryEstimate, offersSource, packageLabel, savePhoto } from "../scripts/fetch-cj.ts";

const URL_ = "https://cjdropshipping.com/product/test-lamp-p-111.html";
const listing = { platform: "CJDROPSHIPPING", supplierSku: "vid-red", url: URL_, unitCostCents: 1000, shippingCostCents: 500 };
const address = { name: "Ada Lovelace", line1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "US", phone: "+15125550100" };

function stubCj(overrides: Record<string, unknown> = {}) {
  const calls: { path: string; body?: unknown }[] = [];
  const data: Record<string, unknown> = {
    "/authentication/getAccessToken": { accessToken: "tok", accessTokenExpiryDate: "2099-01-01T00:00:00Z" },
    "/product/query": { pid: "111", productNameEn: "Test lamp", bigImage: "", variants: [{ vid: "vid-red", variantKey: "Red", variantSellPrice: 12.5 }] },
    "/product/stock/queryByVid": [{ countryCode: "CN", totalInventoryNum: 40 }],
    "/logistic/freightCalculate": [
      { logisticName: "Slow Post", logisticPrice: 9.1, logisticAging: "10-20" },
      { logisticName: "CJPacket", logisticPrice: 6.25, logisticAging: "7-12" },
    ],
    "/shopping/order/createOrderV2": { orderId: "CJ-ORDER-1" },
    "/shopping/order/getOrderDetail": { orderId: "CJ-ORDER-1", orderStatus: "SHIPPED", trackNumber: "YT123" },
    ...overrides,
  };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname.replace("/api2.0/v1", "");
    calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (path !== "/authentication/getAccessToken") expect((init.headers as Record<string, string>)["CJ-Access-Token"]).toBe("tok");
    return new Response(JSON.stringify({ code: 200, result: true, message: "ok", data: data[path] }));
  });
  return { calls, adapter: new CjSupplierAdapter(new CjClient("key", null, 0)) };
}

afterEach(() => vi.unstubAllGlobals());

describe("CjSupplierAdapter", () => {
  it("quotes live stock, variant price and the cheapest US shipping", async () => {
    const { adapter } = stubCj();
    expect(await adapter.getOffer(listing)).toEqual({ available: true, unitCostCents: 1250, shippingCostCents: 625 });
  });

  it("reports out of stock when CJ has none", async () => {
    const { adapter } = stubCj({ "/product/stock/queryByVid": [{ countryCode: "CN", totalInventoryNum: 0 }] });
    expect((await adapter.getOffer(listing)).available).toBe(false);
  });

  it("fails loudly when the variant was removed from the listing", async () => {
    const { adapter } = stubCj({ "/product/query": { pid: "111", productNameEn: "x", bigImage: "", variants: [] } });
    await expect(adapter.getOffer(listing)).rejects.toThrow(/no longer on 111/);
  });

  it("creates an unpaid CJ order shipping to the customer", async () => {
    const { adapter, calls } = stubCj();
    const placed = await adapter.placeOrder({ listing, quantity: 2, address, reference: "ORD-10001" });
    expect(placed).toMatchObject({ supplierOrderId: "CJ-ORDER-1", costCents: 1250 * 2 + 625 });
    expect(placed.note).toMatch(/unpaid/);
    const order = calls.find((c) => c.path === "/shopping/order/createOrderV2")!.body as Record<string, unknown>;
    expect(order).toMatchObject({
      orderNumber: "ORD-10001",
      payType: 3,
      logisticName: "CJPacket",
      shippingCountryCode: "US",
      shippingCountry: "United States",
      shippingProvince: "TX",
      shippingZip: "78701",
      shippingPhone: "+15125550100",
      products: [{ vid: "vid-red", quantity: 2 }],
    });
  });

  it("maps CJ order status to tracking", async () => {
    const { adapter } = stubCj();
    expect(await adapter.getTracking("CJ-ORDER-1")).toMatchObject({ status: "SHIPPED", trackingNumber: "YT123" });
  });
});

describe("CJ import plumbing", () => {
  const cjTsv =
    "product_slug\tpid\tvid\tvariant_key\tunit_cost_usd\tshipping_usd\tlogistic\tdelivery_days\tstock\tpackage_cm\tweight_kg\timage\tchecked_at\n" +
    "test-lamp\t111\tvid-red\tRed\t12.50\t6.25\tCJPacket\t7-12\t40\t33 x 5.2 x 5.2\t0.52\t/images/products/test-lamp-0a1b2c3d.jpg\t2026-10-10\n";
  const sourcing = (option: string) =>
    `product_slug\tplatform\tkind\tsku\turl\toption\tnotes\ntest-lamp\tCJDROPSHIPPING\tlisting\t\t${URL_}\t${option}\t\n`;
  const sheet = parsePriceSheet("sku\tproduct\tprimary_aesthetic\talso_fits\tplacement_slot\tbudget_tier\tsourcing_status\taliexpress_item_id\tunit_cost_usd\tshipping_usd\tnote\n");

  it("routes an imported CJ product by variant id with its live costs and stock", () => {
    const [row] = parseProductSourcing(sourcing("Red"), sheet, parseCjVariants(cjTsv));
    expect(row).toMatchObject({ supplierSku: "vid-red", unitCostCents: 1250, shippingCostCents: 625, stock: 40 });
  });

  it("refuses an import that no longer matches the chosen option", () => {
    expect(() => parseProductSourcing(sourcing("Blue"), sheet, parseCjVariants(cjTsv))).toThrow(/re-run fetch-cj/);
  });

  it("prices the storefront at the floor and only sells what is in stock", () => {
    const [row] = parseCjVariants(cjTsv).values();
    const src = offersSource([row!, { ...row!, productSlug: "test-sold-out", stock: 0 }]);
    expect(src).toContain(`"test-lamp": { priceCents: ${floorRetailCents({ unitCostCents: 1250, shippingCostCents: 625 })}, available: true`);
    expect(src).toContain(`"test-sold-out": { priceCents: 3799, available: false`);
    expect(deliveryEstimate("7-12")).toBe("Arrives in 9-17 business days");
    expect(packageLabel(row!)).toBe("Ships boxed: 33 × 5.2 × 5.2 cm, 0.52 kg");
    expect(src).toContain('image: "/images/products/test-lamp-0a1b2c3d.jpg"');
  });

  it("names photos by content, so a changed photo gets a new URL and the old file goes", () => {
    const dir = mkdtempSync(join(tmpdir(), "cj-photos-")) + "/";
    writeFileSync(`${dir}test-lamp-cj.jpg`, "placeholder");
    writeFileSync(`${dir}test-lamp-shade-cj.jpg`, "another product");
    const first = savePhoto("test-lamp", Buffer.from("photo one"), dir);
    const again = savePhoto("test-lamp", Buffer.from("photo one"), dir);
    const second = savePhoto("test-lamp", Buffer.from("photo two"), dir);
    expect(first).toMatch(/^\/images\/products\/test-lamp-[0-9a-f]{8}\.jpg$/);
    expect(again).toBe(first);
    expect(second).not.toBe(first);
    expect(readdirSync(dir).sort()).toEqual([second.split("/").pop(), "test-lamp-shade-cj.jpg"].sort());
  });

  it("crops spec text off a photo and pads it to the 4:5 tile in its own backdrop colour", async () => {
    const photo = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#e0e0e0" } }).png().toBuffer();
    const out = await catalogueJpeg(photo, [0.2, 0.1, 0.6, 0.9]);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width! / meta.height!).toBeCloseTo(0.8, 2);
    const { data } = await sharp(out).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(Math.abs(data[0]! - 0xe0)).toBeLessThan(4);
  });
});
