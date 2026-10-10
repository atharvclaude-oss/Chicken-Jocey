// The order system only talks to suppliers through this interface, so a
// supplier can be swapped (or a second one added) without touching orders.

export interface SupplierListingRef {
  platform: string;
  supplierSku: string;
  url: string;
  /** What our catalogue has on file; real adapters fetch the live values. */
  unitCostCents: number;
  shippingCostCents: number;
}

// A type alias (not an interface) so it can be stored as a JSON column.
export type ShippingAddress = {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postalCode: string;
  country: string;
  phone?: string | null;
};

export interface LiveOffer {
  available: boolean;
  unitCostCents: number;
  shippingCostCents: number;
}

export interface PlacedOrder {
  supplierOrderId: string;
  /** What we were charged in total (items + shipping). */
  costCents: number;
  /** Anything the admin still has to do at the supplier (e.g. pay the order). */
  note?: string;
}

export interface Tracking {
  status: "PENDING" | "SHIPPED" | "DELIVERED";
  trackingNumber?: string;
  trackingUrl?: string;
}

export interface SupplierAdapter {
  /** Re-check stock and price right before we spend money. */
  getOffer(listing: SupplierListingRef): Promise<LiveOffer>;
  /** Place and pay for the supplier order, shipping straight to the customer. */
  placeOrder(input: {
    listing: SupplierListingRef;
    quantity: number;
    address: ShippingAddress;
    /** Our order number, sent as the supplier's reference. */
    reference: string;
  }): Promise<PlacedOrder>;
  getTracking(supplierOrderId: string): Promise<Tracking>;
}

const costOnFile = (l: SupplierListingRef): LiveOffer => ({
  available: true,
  unitCostCents: l.unitCostCents,
  shippingCostCents: l.shippingCostCents,
});

/**
 * Stand-in supplier for development and tests: in stock at the cost we have on
 * file (override `costs` to simulate price moves) and "ships" on the first
 * tracking check. Replace per platform with a real adapter (Alibaba ICBU
 * dropshipping, AliExpress DS) once that account has API access.
 */
export class MockSupplierAdapter implements SupplierAdapter {
  constructor(private costs: (listing: SupplierListingRef) => LiveOffer = costOnFile) {}

  async getOffer(listing: SupplierListingRef) {
    return this.costs(listing);
  }

  async placeOrder({ listing, quantity, reference }: Parameters<SupplierAdapter["placeOrder"]>[0]) {
    const offer = this.costs(listing);
    return {
      supplierOrderId: `MOCK-${reference}-${listing.supplierSku}`,
      costCents: offer.unitCostCents * quantity + offer.shippingCostCents,
    };
  }

  async getTracking(supplierOrderId: string): Promise<Tracking> {
    return { status: "SHIPPED", trackingNumber: `TRK-${supplierOrderId}` };
  }
}

export type SupplierRegistry = (platform: string) => SupplierAdapter;
