import { describe, expect, it } from "vitest";
import { buildCjOrder, CjSupplierAdapter, countryName, parseCjSku } from "../src/modules/suppliers/cj-adapter.ts";
import { CjClient, cheapestFreight, shipFrom } from "../src/modules/suppliers/cj-client.ts";
import { parseCjListings, CJ_COLUMNS } from "../src/modules/sourcing/sourcing-sheet.ts";
import { retailFor, shippingEstimate } from "../scripts/cj-apply.ts";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** A fake CJ API: answers by path, records every call. */
function fakeCj(routes: Record<string, (body: unknown, url: URL) => unknown>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: url.toString(), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body });
    const path = url.pathname.replace("/api2.0/v1/", "");
    const handler = routes[path];
    if (!handler) return new Response(JSON.stringify({ code: 404, result: false, message: `no route ${path}` }));
    return new Response(JSON.stringify({ code: 200, result: true, message: "ok", data: handler(body, url) }));
  }) as typeof fetch;
  return { calls, client: new CjClient("CJ123@api@key", { fetch: fetchImpl, minIntervalMs: 0 }) };
}

const product = {
  pid: "P1",
  productNameEn: "Wooden Tripod Table Lamp",
  productSku: "CJLAMP",
  bigImage: "https://img/lamp.jpg",
  status: "3",
  variants: [
    { vid: "V-black", variantSku: "CJLAMP-B", variantKey: "Black", variantSellPrice: 12.5, inventories: [{ countryCode: "CN", totalInventory: 900 }, { countryCode: "US", totalInventory: 4 }] },
    { vid: "V-white", variantSku: "CJLAMP-W", variantKey: "White", variantSellPrice: 12.5, inventories: [{ countryCode: "CN", totalInventory: 0 }] },
  ],
};
const freight = [
  { logisticName: "CJPacket Ordinary", logisticPrice: 6.2, logisticAging: "7-12" },
  { logisticName: "USPS", logisticPrice: 4.1, logisticAging: "3-5" },
];
const listing = { platform: "CJDROPSHIPPING", supplierSku: "P1:V-black", url: "https://cjdropshipping.com/product/-p-P1.html", unitCostCents: 0, shippingCostCents: 0 };

describe("CJdropshipping client", () => {
  it("authenticates once with the API key and sends the token on later calls", async () => {
    const { calls, client } = fakeCj({
      "authentication/getAccessToken": () => ({ accessToken: "TOKEN", accessTokenExpiryDate: "2099-01-01T00:00:00Z" }),
      "product/query": () => product,
    });
    await client.product("P1");
    await client.product("P1");
    expect(calls.filter((c) => c.url.includes("getAccessToken"))).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ apiKey: "CJ123@api@key" });
    expect(calls[1]!.headers["CJ-Access-Token"]).toBe("TOKEN");
    expect(calls[2]!.url).toContain("pid=P1");
  });

  it("surfaces CJ error messages", async () => {
    const { client } = fakeCj({ "authentication/getAccessToken": () => ({ accessToken: "T", accessTokenExpiryDate: "2099-01-01" }) });
    await expect(client.product("P1")).rejects.toThrow(/no route product\/query/);
  });

  it("ships from a US warehouse with stock when there is one, and picks the cheapest freight", () => {
    expect(shipFrom(product.variants[0]!)).toEqual({ countryCode: "US", stock: 4 });
    expect(shipFrom(product.variants[1]!)).toEqual({ countryCode: "CN", stock: 0 });
    expect(shipFrom({ vid: "x", variantSku: "x", variantSellPrice: 1 })).toEqual({ countryCode: "CN", stock: null });
    expect(cheapestFreight(freight)?.logisticName).toBe("USPS");
    // Slow sea freight only wins when nothing arrives within 20 days.
    const sea = { logisticName: "Sea", logisticPrice: 3, logisticAging: "25-30" };
    expect(cheapestFreight([sea, freight[0]!])?.logisticName).toBe("CJPacket Ordinary");
    expect(cheapestFreight([sea])?.logisticName).toBe("Sea");
  });
});

describe("CJ supplier adapter", () => {
  const routes = {
    "authentication/getAccessToken": () => ({ accessToken: "TOKEN", accessTokenExpiryDate: "2099-01-01T00:00:00Z" }),
    "product/query": () => product,
    "logistic/freightCalculate": () => freight,
    "shopping/order/createOrderV2": () => ({ orderId: "CJO-1", orderNumber: "ORD-10001-V-black", orderAmount: 20.7, orderStatus: "UNSHIPPED" }),
    "shopping/order/getOrderDetail": () => ({ orderId: "CJO-1", orderStatus: "SHIPPED", trackNumber: "TRK9", trackingUrl: "https://t/9" }),
  };

  it("quotes the exact variant's live cost and cheapest shipping", async () => {
    const { calls, client } = fakeCj(routes);
    const offer = await new CjSupplierAdapter(client).getOffer(listing);
    expect(offer).toEqual({ available: true, unitCostCents: 1250, shippingCostCents: 410 });
    const freightCall = calls.find((c) => c.url.includes("freightCalculate"))!;
    expect(freightCall.body).toEqual({ startCountryCode: "US", endCountryCode: "US", products: [{ vid: "V-black", quantity: 1 }] });
  });

  it("reports an out-of-stock variant as unavailable", async () => {
    const { client } = fakeCj(routes);
    const offer = await new CjSupplierAdapter(client).getOffer({ ...listing, supplierSku: "P1:V-white" });
    expect(offer.available).toBe(false);
  });

  it("places the order for the customer's address, paid from the CJ balance", async () => {
    const { calls, client } = fakeCj(routes);
    const placed = await new CjSupplierAdapter(client).placeOrder({
      listing,
      quantity: 2,
      reference: "ORD-10001",
      address: { name: "Ada Lovelace", line1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "US", phone: "555" },
    });
    expect(placed).toEqual({ supplierOrderId: "CJO-1", costCents: 2070 });
    const order = calls.find((c) => c.url.includes("createOrderV2"))!.body as Record<string, unknown>;
    expect(order).toMatchObject({
      orderNumber: "ORD-10001-V-black",
      shippingCountryCode: "US",
      shippingCountry: "United States",
      shippingProvince: "TX",
      shippingCity: "Austin",
      shippingZip: "78701",
      shippingCustomerName: "Ada Lovelace",
      logisticName: "USPS",
      fromCountryCode: "US",
      products: [{ vid: "V-black", quantity: 2 }],
      payType: 2,
    });
  });

  it("maps CJ order status to tracking", async () => {
    const { client } = fakeCj(routes);
    expect(await new CjSupplierAdapter(client).getTracking("CJO-1")).toEqual({ status: "SHIPPED", trackingNumber: "TRK9", trackingUrl: "https://t/9" });
  });

  it("rejects listing ids that aren't <pid>:<vid>", () => {
    expect(parseCjSku("P1:V1")).toEqual({ pid: "P1", vid: "V1" });
    expect(() => parseCjSku("P1")).toThrow();
  });

  it("builds order numbers CJ accepts and names countries", () => {
    const body = buildCjOrder({
      reference: "ORD-1",
      vid: "x".repeat(60),
      quantity: 1,
      logisticName: "USPS",
      fromCountryCode: "CN",
      address: { name: "A", line1: "L", city: "C", postalCode: "Z", country: "gb" },
    });
    expect(body.orderNumber.length).toBeLessThanOrEqual(50);
    expect(body.shippingCountryCode).toBe("GB");
    expect(countryName("de")).toBe("Germany");
  });
});

describe("CJ sourcing data", () => {
  it("parses cj-listings.tsv into supplier listings", () => {
    const header = CJ_COLUMNS.join("\t");
    const row = ["tripod-table-lamp", "P1", "V-black", "Black", "12.50", "4.10", "USPS", "US", "3-5", "yes", "https://cjdropshipping.com/product/-p-P1.html", "2026-10-10", ""].join("\t");
    const [l] = parseCjListings(`${header}\n${row}\n`);
    expect(l).toMatchObject({
      productSlug: "tripod-table-lamp",
      platform: "CJDROPSHIPPING",
      kind: "listing",
      supplierSku: "P1:V-black",
      unitCostCents: 1250,
      shippingCostCents: 410,
      inStock: true,
      deliveryDays: 5,
    });
  });

  it("prices at the 2x floor with a .99 ending and words the shipping window", () => {
    expect(retailFor(1250, 410)).toBe(3399); // $16.60 landed -> at least $33.20 -> $33.99
    expect(retailFor(1250, 410)).toBeGreaterThanOrEqual(2 * 1660);
    expect(shippingEstimate("7-12")).toBe("Ships in 7–12 days");
    expect(shippingEstimate("5")).toBe("Ships in 5 days");
  });
});
