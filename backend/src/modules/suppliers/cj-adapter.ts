// CJdropshipping as a SupplierAdapter: live stock/price checks, ordering (paid
// from the CJ account balance) and tracking. A CJ listing's supplierSku is
// "<pid>:<vid>" (product id : exact variant id), written by `npm run cj:apply`.

import { bestRoute, CjClient, CjError, shipFrom, usdToCents, type CjProduct, type CjVariant } from "./cj-client.ts";
import type { LiveOffer, PlacedOrder, ShippingAddress, SupplierAdapter, SupplierListingRef, Tracking } from "./supplier-adapter.ts";

export function parseCjSku(supplierSku: string): { pid: string; vid: string } {
  const [pid, vid] = supplierSku.split(":");
  if (!pid || !vid) throw new CjError(`Not a CJ listing id (expected "<pid>:<vid>"): ${supplierSku}`);
  return { pid, vid };
}

const regionName = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (code: string) => regionName.of(code.toUpperCase()) ?? code;

/** CJ statuses we treat as "not on sale". CJ reports "3" for on-sale products. */
const OFF_SALE = new Set(["0", "1", "2", "4", "5"]);

export class CjSupplierAdapter implements SupplierAdapter {
  constructor(
    private cj: CjClient,
    /** Destination assumed for price checks that have no address yet. */
    private defaultCountry = "US",
  ) {}

  private async variant(listing: SupplierListingRef): Promise<{ product: CjProduct; variant: CjVariant }> {
    const { pid, vid } = parseCjSku(listing.supplierSku);
    const product = await this.cj.product(pid);
    const variant = product.variants?.find((v) => v.vid === vid);
    if (!variant) throw new CjError(`CJ product ${pid} no longer has variant ${vid}`);
    return { product, variant };
  }

  async getOffer(listing: SupplierListingRef): Promise<LiveOffer> {
    const { product, variant } = await this.variant(listing);
    const from = shipFrom(variant);
    const route = await bestRoute(this.cj, { vid: variant.vid, quantity: 1, endCountryCode: this.defaultCountry, prefer: from.stock ? from.countryCode : undefined });
    return {
      available: !OFF_SALE.has(String(product.status ?? "3")) && from.stock !== 0 && route !== null,
      unitCostCents: usdToCents(variant.variantSellPrice),
      shippingCostCents: route ? usdToCents(route.option.logisticPrice) : 0,
    };
  }

  async placeOrder({ listing, quantity, address, reference }: { listing: SupplierListingRef; quantity: number; address: ShippingAddress; reference: string }): Promise<PlacedOrder> {
    const { variant } = await this.variant(listing);
    const from = shipFrom(variant);
    const route = await bestRoute(this.cj, {
      vid: variant.vid,
      quantity,
      endCountryCode: address.country,
      zip: address.postalCode,
      prefer: from.stock ? from.countryCode : undefined,
    });
    if (!route) throw new CjError(`CJ has no shipping route for variant ${variant.vid} to ${address.country}`);
    const created = await this.cj.createOrder(
      buildCjOrder({ reference, vid: variant.vid, quantity, address, logisticName: route.option.logisticName, fromCountryCode: route.from }),
    );
    return { supplierOrderId: created.orderId, costCents: usdToCents(created.orderAmount) };
  }

  async getTracking(supplierOrderId: string): Promise<Tracking> {
    const order = await this.cj.orderDetail(supplierOrderId);
    const status = order.orderStatus === "DELIVERED" ? "DELIVERED" : order.orderStatus === "SHIPPED" ? "SHIPPED" : "PENDING";
    return {
      status,
      trackingNumber: order.trackNumber || undefined,
      trackingUrl: order.trackingUrl || undefined,
    };
  }
}

/** The createOrderV2 body for one listing, paid from the CJ balance. */
export function buildCjOrder(input: {
  reference: string;
  vid: string;
  quantity: number;
  address: ShippingAddress;
  logisticName: string;
  fromCountryCode: string;
}) {
  const a = input.address;
  return {
    // One fulfilment per listing, so our order number + variant is unique at CJ.
    orderNumber: `${input.reference}-${input.vid}`.slice(0, 50),
    shippingCountryCode: a.country.toUpperCase(),
    shippingCountry: countryName(a.country),
    shippingProvince: a.state ?? "",
    shippingCity: a.city,
    shippingAddress: a.line1,
    shippingAddress2: a.line2 ?? undefined,
    shippingZip: a.postalCode,
    shippingPhone: a.phone ?? undefined,
    shippingCustomerName: a.name,
    logisticName: input.logisticName,
    fromCountryCode: input.fromCountryCode,
    products: [{ vid: input.vid, quantity: input.quantity }],
    payType: 2 as const,
    remark: input.reference,
  };
}
