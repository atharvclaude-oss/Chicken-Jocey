// Stock checks (scripts/check-stock.ts) and the new-order email (notifications/order-alerts.ts).
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALIEXPRESS_DELIVERY, markup, parseOfferPrices } from "../scripts/check-stock.ts";
import { offersSource } from "../scripts/fetch-cj.ts";
import { resendOrderAlert } from "../src/modules/notifications/order-alerts.ts";
import type { CjVariantRow } from "../src/modules/sourcing/sourcing-sheet.ts";

const row = (over: Partial<CjVariantRow> = {}): CjVariantRow => ({
  productSlug: "lamp-a",
  pid: "1",
  vid: "2",
  variantKey: "Red",
  unitCostCents: 1000,
  shippingCostCents: 500,
  logistic: "CJPacket",
  deliveryDays: "7-12",
  stock: 40,
  packageCm: "",
  weightKg: 0,
  image: "/images/products/lamp-a.jpg",
  checkedAt: "2026-10-10",
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("check-stock", () => {
  it("keeps current prices and shows the AliExpress delivery window", () => {
    const src = offersSource([row(), row({ productSlug: "lamp-b", stock: 0 })], { keepPrices: { "lamp-a": 4599, "lamp-b": 2999 }, shippingEstimate: ALIEXPRESS_DELIVERY });
    expect(src).toContain(`"lamp-a": { priceCents: 4599, available: true, shippingEstimate: "Arrives in 10-25 business days"`);
    expect(src).toContain(`"lamp-b": { priceCents: 2999, available: false`);
  });

  it("reads the current prices back out of the offers file", () => {
    const src = offersSource([row(), row({ productSlug: "lamp-b" })], { keepPrices: { "lamp-a": 4599, "lamp-b": 2999 } });
    expect(parseOfferPrices(src)).toEqual({ "lamp-a": 4599, "lamp-b": 2999 });
  });

  it("measures markup against landed cost", () => {
    expect(markup(4000, 2000)).toBe(2);
    expect(markup(3000, 2000)).toBeLessThan(2);
    expect(markup(3000, 0)).toBe(Infinity);
  });
});

describe("new-order email", () => {
  it("emails the order summary and a link to the orders page", async () => {
    const sent: { url: string; body: Record<string, unknown>; auth: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization ?? "" });
      return new Response("{}", { status: 200 });
    });
    const db = {
      order: {
        findUniqueOrThrow: async () => ({
          number: 183,
          totalCents: 4599,
          shippingAddress: { name: "Jane <b>", city: "Portland", state: "OR", country: "US" },
          items: [{ productName: "Beech Mushroom Bedside Lamp", quantity: 1, unitPriceCents: 4599 }],
        }),
      },
    } as never;
    await resendOrderAlert({ db, apiKey: "re_test", to: "team@example.com", from: "Room8 <a@b.c>", siteUrl: "https://room8.example" })("o1");
    expect(sent[0]!.url).toBe("https://api.resend.com/emails");
    expect(sent[0]!.auth).toBe("Bearer re_test");
    expect(sent[0]!.body).toMatchObject({ to: ["team@example.com"], subject: "New order ORD-10183: $45.99" });
    expect(String(sent[0]!.body.text)).toContain("https://room8.example/admin/orders");
    expect(String(sent[0]!.body.html)).toContain("Jane &lt;b&gt;"); // customer text is escaped
  });

  it("reports a failed send so it is logged", async () => {
    vi.stubGlobal("fetch", async () => new Response("bad key", { status: 401 }));
    const db = { order: { findUniqueOrThrow: async () => ({ number: 1, totalCents: 100, shippingAddress: null, items: [] }) } } as never;
    await expect(resendOrderAlert({ db, apiKey: "re_x", to: "a@b.c", from: "x", siteUrl: "http://s" })("o1")).rejects.toThrow(/401/);
  });
});
