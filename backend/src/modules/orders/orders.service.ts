import type Stripe from "stripe";
import type { Db } from "../../db/client.ts";
import { Availability, FulfillmentStatus, OrderStatus, ProductStatus } from "../../generated/prisma/enums.ts";
import { isBelowFloor } from "../pricing/pricing.ts";
import type { ShippingAddress, SupplierRegistry } from "../suppliers/supplier-adapter.ts";

const SELLABLE: Availability[] = [Availability.AVAILABLE, Availability.LOW_CONFIDENCE];
/** A supplier price rise above this (vs. cost when paid) stops for review. */
export const MAX_COST_INCREASE = 0.1;

export class OrderError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

export interface CheckoutItem {
  /** Product id or slug. */
  productId: string;
  quantity: number;
}

export const orderNumber = (n: number) => `ORD-${10000 + n}`;

export class OrderService {
  constructor(
    private db: Db,
    private stripe: Stripe,
    private suppliers: SupplierRegistry,
    private siteUrl: string,
  ) {}

  /**
   * Prices the cart on the server (the client only sends ids and quantities),
   * stores a PAYMENT_PENDING order and opens a Stripe Checkout session for it.
   */
  async createCheckout(items: CheckoutItem[]) {
    const merged = new Map<string, number>();
    for (const i of items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.quantity);

    const keys = [...merged.keys()];
    const products = await this.db.product.findMany({
      where: { OR: [{ id: { in: keys } }, { slug: { in: keys } }] },
      include: { variants: { orderBy: { position: "asc" }, take: 1 } },
    });
    const lines = keys.map((key) => {
      const product = products.find((p) => p.id === key || p.slug === key);
      const variant = product?.variants[0];
      if (!product || !variant) throw new OrderError(`Unknown product: ${key}`, 404);
      if (product.status !== ProductStatus.ACTIVE || !SELLABLE.includes(variant.availability)) {
        throw new OrderError(`${product.name} is not available right now`, 409);
      }
      return { product, variant, quantity: merged.get(key)! };
    });

    const subtotal = lines.reduce((sum, l) => sum + l.variant.priceCents * l.quantity, 0);
    const order = await this.db.order.create({
      data: {
        subtotalCents: subtotal,
        totalCents: subtotal,
        items: {
          create: lines.map((l) => ({
            variantId: l.variant.id,
            productName: l.product.name,
            unitPriceCents: l.variant.priceCents,
            quantity: l.quantity,
          })),
        },
      },
    });

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: order.id,
        metadata: { orderId: order.id },
        payment_intent_data: { metadata: { orderId: order.id } },
        shipping_address_collection: { allowed_countries: ["US"] },
        line_items: lines.map((l) => ({
          quantity: l.quantity,
          price_data: {
            currency: "usd",
            unit_amount: l.variant.priceCents,
            product_data: { name: l.product.name, images: imageUrl(l.variant.image, this.siteUrl) },
          },
        })),
        success_url: `${this.siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.siteUrl}/cart`,
      },
      // Same order never opens two sessions, even if this request is retried.
      { idempotencyKey: `checkout-${order.id}` },
    );
    await this.db.order.update({ where: { id: order.id }, data: { stripeCheckoutId: session.id } });
    return { orderId: order.id, number: orderNumber(order.number), url: session.url! };
  }

  /** Stripe webhook events. Safe to receive the same event more than once. */
  async handleEvent(event: Stripe.Event) {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        if (event.data.object.payment_status === "paid") await this.markPaid(event.data.object);
        return;
      case "checkout.session.expired":
        await this.db.order.updateMany({
          where: { stripeCheckoutId: event.data.object.id, status: OrderStatus.PAYMENT_PENDING },
          data: { status: OrderStatus.CANCELLED },
        });
        return;
      case "charge.refunded": {
        const charge = event.data.object;
        if (!charge.refunded) return; // partial refund: leave the order as is
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (pi) {
          await this.db.order.updateMany({ where: { stripePaymentIntentId: pi }, data: { status: OrderStatus.REFUNDED } });
        }
        return;
      }
    }
  }

  private async markPaid(session: Stripe.Checkout.Session) {
    const orderId = session.metadata?.orderId ?? session.client_reference_id;
    if (!orderId) return;
    const ship = session.collected_information?.shipping_details;
    const address: ShippingAddress | null = ship
      ? {
          name: ship.name,
          line1: ship.address.line1 ?? "",
          line2: ship.address.line2,
          city: ship.address.city ?? "",
          state: ship.address.state,
          postalCode: ship.address.postal_code ?? "",
          country: ship.address.country ?? "",
          phone: session.customer_details?.phone,
        }
      : null;

    await this.db.$transaction(async (tx) => {
      // Only the first delivery of the event moves the order; repeats are no-ops.
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PAYMENT_PENDING },
        data: {
          status: OrderStatus.PAID,
          paidAt: new Date(),
          email: session.customer_details?.email ?? null,
          shippingAddress: address ?? undefined,
          stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
        },
      });
      if (count === 0) return;

      // One fulfilment per supplier listing; items with no orderable listing go to manual review.
      const items = await tx.orderItem.findMany({
        where: { orderId },
        include: { variant: { include: { supplierListings: { orderBy: { priority: "asc" } } } } },
      });
      const groups = new Map<string, typeof items>();
      for (const item of items) {
        const listing = item.variant.supplierListings.find((l) => SELLABLE.includes(l.availability));
        const key = listing?.id ?? `none:${item.id}`;
        groups.set(key, [...(groups.get(key) ?? []), item]);
      }
      for (const [key, group] of groups) {
        const listing = key.startsWith("none:") ? null : group[0]!.variant.supplierListings.find((l) => l.id === key)!;
        const qty = group.reduce((n, i) => n + i.quantity, 0);
        await tx.fulfillment.create({
          data: {
            orderId,
            supplierProductId: listing?.id ?? null,
            status: listing ? FulfillmentStatus.AWAITING_APPROVAL : FulfillmentStatus.MANUAL_REVIEW,
            expectedCostCents: listing ? listing.unitCostCents * qty + listing.shippingCostCents : 0,
            note: listing ? "" : "No orderable supplier listing when the order was paid",
            items: { connect: group.map((i) => ({ id: i.id })) },
          },
        });
      }
    });
  }

  /**
   * Admin approval: re-check the supplier's live stock and price, then place
   * the supplier order. Stops (without spending) if stock or price moved.
   */
  async approveFulfillment(id: string) {
    // Claim it first so a double click can't order twice.
    const { count } = await this.db.fulfillment.updateMany({
      where: { id, status: FulfillmentStatus.AWAITING_APPROVAL, order: { status: { in: [OrderStatus.PAID, OrderStatus.FULFILLING] } } },
      data: { status: FulfillmentStatus.SUPPLIER_VALIDATION, approvedAt: new Date() },
    });
    if (count === 0) throw new OrderError("Fulfilment is not awaiting approval", 409);

    const f = await this.db.fulfillment.findUniqueOrThrow({
      where: { id },
      include: { order: true, items: true, supplierProduct: { include: { supplier: true } } },
    });
    const listing = f.supplierProduct!;
    const ref = {
      platform: listing.supplier.platform,
      supplierSku: listing.supplierSku,
      url: listing.url,
      unitCostCents: listing.unitCostCents,
      shippingCostCents: listing.shippingCostCents,
    };
    const adapter = this.suppliers(listing.supplier.platform);
    const qty = f.items.reduce((n, i) => n + i.quantity, 0);
    const retail = f.items.reduce((n, i) => n + i.unitPriceCents * i.quantity, 0);

    const stop = (status: FulfillmentStatus, note: string) =>
      this.db.fulfillment.update({ where: { id }, data: { status, note } });

    const supplierFailed = async (err: unknown) => {
      await stop(FulfillmentStatus.SUPPLIER_ERROR, err instanceof Error ? err.message : String(err));
      return new OrderError("Supplier request failed; marked SUPPLIER_ERROR", 424);
    };

    const offer = await adapter.getOffer(ref).catch(async (err) => Promise.reject(await supplierFailed(err)));
    if (!offer.available) return stop(FulfillmentStatus.OUT_OF_STOCK, "Supplier is out of stock");
    const liveCost = offer.unitCostCents * qty + offer.shippingCostCents;
    if (liveCost > f.expectedCostCents * (1 + MAX_COST_INCREASE)) {
      return stop(FulfillmentStatus.PRICE_CHANGED, `Supplier cost rose from ${f.expectedCostCents} to ${liveCost} cents`);
    }
    if (isBelowFloor(retail, { unitCostCents: offer.unitCostCents * qty, shippingCostCents: offer.shippingCostCents })) {
      return stop(FulfillmentStatus.PRICE_CHANGED, `Margin below floor at supplier cost ${liveCost} cents`);
    }
    const address = f.order.shippingAddress as ShippingAddress | null;
    if (!address?.line1 || !address.postalCode) return stop(FulfillmentStatus.ADDRESS_ERROR, "Order has no usable shipping address");

    const placed = await adapter
      .placeOrder({ listing: ref, quantity: qty, address, reference: orderNumber(f.order.number) })
      .catch(async (err) => Promise.reject(await supplierFailed(err)));
    await this.db.$transaction([
      this.db.fulfillment.update({
        where: { id },
        data: { status: FulfillmentStatus.SUPPLIER_ORDER_CREATED, supplierOrderId: placed.supplierOrderId, actualCostCents: placed.costCents, note: "" },
      }),
      this.db.order.update({ where: { id: f.orderId }, data: { status: OrderStatus.FULFILLING } }),
    ]);
    return this.db.fulfillment.findUniqueOrThrow({ where: { id } });
  }

  /** Pull tracking from the supplier; the order ships once every fulfilment has. */
  async refreshTracking(id: string) {
    const f = await this.db.fulfillment.findUnique({ where: { id }, include: { supplierProduct: { include: { supplier: true } } } });
    if (!f?.supplierOrderId || !f.supplierProduct) throw new OrderError("No supplier order to track", 409);
    const t = await this.suppliers(f.supplierProduct.supplier.platform).getTracking(f.supplierOrderId);
    if (t.status === "PENDING") return f;
    const status = t.status === "DELIVERED" ? FulfillmentStatus.DELIVERED : FulfillmentStatus.SHIPPED;
    await this.db.fulfillment.update({
      where: { id },
      data: { status, trackingNumber: t.trackingNumber ?? f.trackingNumber, trackingUrl: t.trackingUrl ?? f.trackingUrl },
    });
    const all = await this.db.fulfillment.findMany({ where: { orderId: f.orderId }, select: { status: true } });
    const done = (s: FulfillmentStatus[]) => all.every((x) => s.includes(x.status));
    const next = done([FulfillmentStatus.DELIVERED])
      ? OrderStatus.DELIVERED
      : done([FulfillmentStatus.SHIPPED, FulfillmentStatus.DELIVERED])
        ? OrderStatus.SHIPPED
        : null;
    if (next) await this.db.order.update({ where: { id: f.orderId }, data: { status: next } });
    return this.db.fulfillment.findUniqueOrThrow({ where: { id } });
  }

  listFulfillments(status?: FulfillmentStatus) {
    return this.db.fulfillment.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "asc" },
      include: {
        order: { select: { number: true, email: true, shippingAddress: true, status: true } },
        items: { select: { productName: true, quantity: true, unitPriceCents: true } },
        supplierProduct: { select: { url: true, supplierSku: true, supplier: { select: { name: true, platform: true } } } },
      },
    });
  }

  /** What the order confirmation page shows. Looked up by the Checkout session id. */
  async publicOrder(checkoutId: string) {
    const order = await this.db.order.findUnique({
      where: { stripeCheckoutId: checkoutId },
      include: { items: true, fulfillments: { select: { status: true, trackingNumber: true, trackingUrl: true } } },
    });
    if (!order) return null;
    return {
      number: orderNumber(order.number),
      status: order.status,
      totalCents: order.totalCents,
      items: order.items.map((i) => ({ name: i.productName, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
      shipments: order.fulfillments
        .filter((f) => f.trackingNumber)
        .map((f) => ({ trackingNumber: f.trackingNumber, trackingUrl: f.trackingUrl })),
    };
  }
}

/** Stripe needs absolute, public image URLs; skip ones it can't fetch (e.g. localhost). */
function imageUrl(image: string, siteUrl: string): string[] {
  const url = image.startsWith("http") ? image : `${siteUrl}${image}`;
  return /^https:\/\//.test(url) && !url.includes("localhost") ? [url] : [];
}
