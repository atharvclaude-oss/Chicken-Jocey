// Manual purchasing: after a customer pays, a person buys the item on AliExpress (or anywhere) by
// hand, shipping to the customer's address, then records it in the admin orders page
// (POST /admin/fulfillments/:id/purchased, /shipped, /delivered). No supplier API is called.

import type { LiveOffer, PlacedOrder, SupplierAdapter, SupplierListingRef, Tracking } from "./supplier-adapter.ts";

export class ManualPurchaseAdapter implements SupplierAdapter {
  /** Nothing to check automatically: the person buying it sees the live price and stock. */
  async getOffer(listing: SupplierListingRef): Promise<LiveOffer> {
    return { available: true, unitCostCents: listing.unitCostCents, shippingCostCents: listing.shippingCostCents };
  }

  async placeOrder(): Promise<PlacedOrder> {
    throw new Error("Manual purchase: buy it on AliExpress, then mark the fulfilment as bought in the admin orders page.");
  }

  async getTracking(): Promise<Tracking> {
    throw new Error("Manual purchase: enter the tracking number in the admin orders page.");
  }
}
