// Live CJdropshipping supplier: real stock, price and shipping checks, order creation and tracking.
//
// Orders are created with payType 3 ("create order only"): CJ holds the order unpaid until someone
// pays it in the CJ dashboard (My CJ > Orders), so approving a fulfilment never spends wallet money
// on its own.

import { bestRoute, CjClient, cjPidFromUrl, usdToCents } from "./cj.ts";
import type { LiveOffer, PlacedOrder, SupplierAdapter, SupplierListingRef, Tracking } from "./supplier-adapter.ts";

const ORDER_ONLY = 3;
const countryName = (code: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;

export class CjSupplierAdapter implements SupplierAdapter {
  constructor(private cj: CjClient) {}

  /** The listing's supplierSku is the CJ variant id (vid), set by `npm run fetch-cj`. */
  private async variant(listing: SupplierListingRef) {
    const pid = cjPidFromUrl(listing.url);
    if (!pid) throw new Error(`Not a CJ product URL: ${listing.url}`);
    const product = await this.cj.product(pid);
    const variant = product.variants?.find((v) => v.vid === listing.supplierSku);
    if (!variant) throw new Error(`CJ variant ${listing.supplierSku} is no longer on ${pid}; re-run fetch-cj`);
    return variant;
  }

  async getOffer(listing: SupplierListingRef): Promise<LiveOffer> {
    const variant = await this.variant(listing);
    const stock = await this.cj.get<{ totalInventoryNum?: number }[]>(
      `/product/stock/queryByVid?vid=${encodeURIComponent(variant.vid)}`,
    );
    const route = await bestRoute(this.cj, variant.vid);
    return {
      available: Boolean(route) && (stock ?? []).some((s) => (s.totalInventoryNum ?? 0) > 0),
      unitCostCents: usdToCents(variant.variantSellPrice),
      shippingCostCents: usdToCents(route?.freight.logisticPrice),
    };
  }

  async placeOrder({ listing, quantity, address, reference }: Parameters<SupplierAdapter["placeOrder"]>[0]): Promise<PlacedOrder> {
    const variant = await this.variant(listing);
    // US warehouse first (many furniture listings ship only, and free, from there), then China.
    const route = await bestRoute(this.cj, variant.vid, quantity, address.country, address.postalCode);
    if (!route) throw new Error(`CJ has no shipping option to ${address.country}`);
    const ship = route.freight;
    const order = await this.cj.createOrder({
      orderNumber: reference,
      payType: ORDER_ONLY,
      fromCountryCode: route.from,
      logisticName: ship.logisticName,
      shippingCountryCode: address.country,
      shippingCountry: countryName(address.country),
      shippingProvince: address.state ?? "",
      shippingCity: address.city,
      shippingCustomerName: address.name,
      shippingAddress: address.line1,
      shippingAddress2: address.line2 ?? "",
      shippingZip: address.postalCode,
      shippingPhone: address.phone ?? "",
      remark: `Room8 ${reference}`,
      products: [{ vid: variant.vid, quantity }],
    });
    return {
      supplierOrderId: order.orderId,
      costCents: usdToCents(variant.variantSellPrice) * quantity + usdToCents(ship.logisticPrice),
      note: `Created unpaid in CJ (${ship.logisticName} from ${route.from}). Pay it in CJ: My CJ > Orders.`,
    };
  }

  async getTracking(supplierOrderId: string): Promise<Tracking> {
    const detail = await this.cj.orderDetail(supplierOrderId);
    const trackingNumber = detail.trackNumber || undefined;
    const status = detail.orderStatus === "DELIVERED" ? "DELIVERED" : detail.orderStatus === "SHIPPED" ? "SHIPPED" : "PENDING";
    return {
      status,
      trackingNumber,
      trackingUrl: trackingNumber ? `https://www.17track.net/en/track?nums=${encodeURIComponent(trackingNumber)}` : undefined,
    };
  }
}
