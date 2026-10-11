// Runs against DATABASE_URL after `npm run db:seed`. Creates "test-" rows and
// removes them afterwards. Stripe's API is stubbed; webhook signatures use the
// real Stripe verification with a test secret.
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { prisma } from "../src/db/client.ts";
import { Availability, FulfillmentStatus, OrderStatus, ProductStatus, SupplierPlatform } from "../src/generated/prisma/enums.ts";
import { MockSupplierAdapter, type SupplierAdapter } from "../src/modules/suppliers/supplier-adapter.ts";

const ADMIN = "test-admin-key-0123456789abcdef0123456789";
const WEBHOOK_SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy");

const sessions: Stripe.Checkout.SessionCreateParams[] = [];
stripe.checkout.sessions.create = (async (params: Stripe.Checkout.SessionCreateParams) => {
  sessions.push(params);
  const id = `cs_test_${sessions.length}_${Date.now()}`;
  return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
}) as unknown as typeof stripe.checkout.sessions.create;

let supplier: SupplierAdapter = new MockSupplierAdapter();
const alerts: string[] = [];
const app = await buildApp({
  db: prisma,
  adminApiKey: ADMIN,
  payments: { stripe, webhookSecret: WEBHOOK_SECRET, suppliers: () => supplier, siteUrl: "http://localhost:3000", alert: async (id) => void alerts.push(id) },
});

const admin = { authorization: `Bearer ${ADMIN}` };
const orderIds: string[] = [];

async function checkout(items: { productId: string; quantity: number }[]) {
  const res = await app.inject({ method: "POST", url: "/checkout", payload: { items } });
  if (res.statusCode === 201) orderIds.push(res.json().orderId);
  return res;
}

function sendWebhook(event: object, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return app.inject({
    method: "POST",
    url: "/webhooks/stripe",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    payload,
  });
}

const paidEvent = (sessionId: string, orderId: string) => ({
  id: `evt_${sessionId}`,
  object: "event",
  type: "checkout.session.completed",
  data: {
    object: {
      id: sessionId,
      object: "checkout.session",
      payment_status: "paid",
      metadata: { orderId },
      client_reference_id: orderId,
      payment_intent: `pi_${sessionId}`,
      customer_details: { email: "buyer@example.com", phone: null },
      collected_information: {
        shipping_details: {
          name: "Test Buyer",
          address: { line1: "1 Main St", line2: null, city: "Austin", state: "TX", postal_code: "78701", country: "US" },
        },
      },
    },
  },
});

async function payFor(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return sendWebhook(paidEvent(order.stripeCheckoutId!, orderId));
}

async function cleanup() {
  await prisma.order.deleteMany({ where: { items: { some: { variant: { sku: { startsWith: "test-" } } } } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: "test-" } } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: "test-" } } });
}

beforeAll(async () => {
  await cleanup();
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: "lighting" } });
  // Products with no supplier listing, and one that is sold out.
  for (const [slug, status, availability] of [
    ["test-unsourced-lamp", ProductStatus.ACTIVE, Availability.AVAILABLE],
    ["test-sold-out-candle", ProductStatus.OUT_OF_STOCK, Availability.OUT_OF_STOCK],
  ] as const) {
    await prisma.product.create({
      data: {
        slug,
        name: slug,
        status,
        categoryId: category.id,
        variants: { create: { sku: slug, priceCents: 2499, image: "/x.jpg", availability } },
      },
    });
  }
  const sup = await prisma.supplier.create({ data: { name: "test-supplier", platform: SupplierPlatform.ALIEXPRESS } });
  await prisma.product.create({
    data: {
      slug: "test-order-lamp",
      name: "Test Order Lamp",
      status: ProductStatus.ACTIVE,
      categoryId: category.id,
      variants: {
        create: {
          sku: "test-order-lamp-blk",
          priceCents: 2499,
          image: "/images/products/mushroom-lamp.jpg",
          availability: Availability.AVAILABLE,
          supplierListings: {
            create: {
              supplierId: sup.id,
              supplierSku: "test-sku-1",
              url: "https://example.com/item/1",
              unitCostCents: 800,
              shippingCostCents: 200,
              availability: Availability.AVAILABLE,
            },
          },
        },
      },
    },
  });
});

afterAll(async () => {
  await cleanup();
  await app.close();
  await prisma.$disconnect();
});

describe("checkout", () => {
  it("prices the cart on the server and opens a Stripe session", async () => {
    const res = await checkout([
      { productId: "test-order-lamp", quantity: 1 },
      { productId: "test-order-lamp", quantity: 1 },
      { productId: "test-unsourced-lamp", quantity: 1 },
    ]);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(body.number).toMatch(/^ORD-\d+$/);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: body.orderId }, include: { items: true } });
    expect(order.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(order.totalCents).toBe(2499 * 2 + 2499);
    expect(order.items.find((i) => i.productName === "Test Order Lamp")?.quantity).toBe(2);

    const params = sessions.at(-1)!;
    expect(params.metadata?.orderId).toBe(order.id);
    expect(params.line_items?.map((l) => l.price_data?.unit_amount)).toEqual([2499, 2499]);
  });

  it("ignores any price the client sends", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/checkout",
      payload: { items: [{ productId: "test-order-lamp", quantity: 1, priceCents: 1 }] },
    });
    orderIds.push(res.json().orderId);
    expect(sessions.at(-1)!.line_items?.[0]?.price_data?.unit_amount).toBe(2499);
  });

  it("rejects unknown and unavailable products", async () => {
    expect((await checkout([{ productId: "test-nope", quantity: 1 }])).statusCode).toBe(404);
    expect((await checkout([{ productId: "test-sold-out-candle", quantity: 1 }])).statusCode).toBe(409);
    expect((await checkout([{ productId: "test-order-lamp", quantity: 0 }])).statusCode).toBe(400);
    expect((await checkout([])).statusCode).toBe(400);
  });
});

describe("stripe webhook", () => {
  it("rejects a bad signature", async () => {
    const res = await sendWebhook({ type: "checkout.session.completed", data: { object: {} } }, "whsec_wrong");
    expect(res.statusCode).toBe(400);
  });

  it("marks the order paid and queues fulfilment for approval, once", async () => {
    const { orderId } = (await checkout([
      { productId: "test-order-lamp", quantity: 2 },
      { productId: "test-unsourced-lamp", quantity: 1 },
    ])).json();

    expect((await payFor(orderId)).statusCode).toBe(200);
    expect((await payFor(orderId)).statusCode).toBe(200); // Stripe retries are no-ops

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { fulfillments: true } });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(order.email).toBe("buyer@example.com");
    expect(order.shippingAddress).toMatchObject({ line1: "1 Main St", postalCode: "78701" });
    expect(order.fulfillments).toHaveLength(2);

    const listed = order.fulfillments.find((f) => f.supplierProductId)!;
    expect(listed.status).toBe(FulfillmentStatus.AWAITING_APPROVAL);
    expect(listed.expectedCostCents).toBe(800 * 2 + 200);
    // test-unsourced-lamp has no supplier listing yet: a person has to source it.
    expect(order.fulfillments.find((f) => !f.supplierProductId)!.status).toBe(FulfillmentStatus.MANUAL_REVIEW);
    // The team is emailed once per paid order, not once per Stripe retry.
    expect(alerts.filter((id) => id === orderId)).toHaveLength(1);
  });

  it("cancels the order when the session expires", async () => {
    const { orderId } = (await checkout([{ productId: "test-order-lamp", quantity: 1 }])).json();
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await sendWebhook({ id: "evt_x", type: "checkout.session.expired", data: { object: { id: order.stripeCheckoutId } } });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(OrderStatus.CANCELLED);
  });
});

describe("fulfilment approval", () => {
  async function paidFulfillment() {
    const { orderId } = (await checkout([{ productId: "test-order-lamp", quantity: 1 }])).json();
    await payFor(orderId);
    return prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
  }

  it("needs the admin key", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/fulfillments" });
    expect(res.statusCode).toBe(401);
  });

  it("places the supplier order on approval, and only once", async () => {
    supplier = new MockSupplierAdapter();
    const f = await paidFulfillment();
    const queue = await app.inject({ method: "GET", url: "/admin/fulfillments?status=AWAITING_APPROVAL", headers: admin });
    expect(queue.json().map((x: { id: string }) => x.id)).toContain(f.id);

    const res = await app.inject({ method: "POST", url: `/admin/fulfillments/${f.id}/approve`, headers: admin });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: FulfillmentStatus.SUPPLIER_ORDER_CREATED, actualCostCents: 1000 });
    expect(res.json().supplierOrderId).toMatch(/^MOCK-ORD-/);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } })).status).toBe(OrderStatus.FULFILLING);

    const again = await app.inject({ method: "POST", url: `/admin/fulfillments/${f.id}/approve`, headers: admin });
    expect(again.statusCode).toBe(409);
  });

  it("stops without ordering when the supplier price jumped", async () => {
    supplier = new MockSupplierAdapter((l) => ({ available: true, unitCostCents: l.unitCostCents * 3, shippingCostCents: l.shippingCostCents }));
    const f = await paidFulfillment();
    const res = await app.inject({ method: "POST", url: `/admin/fulfillments/${f.id}/approve`, headers: admin });
    expect(res.json()).toMatchObject({ status: FulfillmentStatus.PRICE_CHANGED, supplierOrderId: null });
  });

  it("stops when the supplier is out of stock", async () => {
    supplier = new MockSupplierAdapter((l) => ({ available: false, unitCostCents: l.unitCostCents, shippingCostCents: 0 }));
    const f = await paidFulfillment();
    const res = await app.inject({ method: "POST", url: `/admin/fulfillments/${f.id}/approve`, headers: admin });
    expect(res.json().status).toBe(FulfillmentStatus.OUT_OF_STOCK);
  });

  it("syncs tracking and ships the order", async () => {
    supplier = new MockSupplierAdapter();
    const f = await paidFulfillment();
    await app.inject({ method: "POST", url: `/admin/fulfillments/${f.id}/approve`, headers: admin });
    const res = await app.inject({ method: "POST", url: `/admin/fulfillments/${f.id}/tracking`, headers: admin });
    expect(res.json()).toMatchObject({ status: FulfillmentStatus.SHIPPED });
    expect(res.json().trackingNumber).toBeTruthy();

    const order = await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } });
    expect(order.status).toBe(OrderStatus.SHIPPED);
    const pub = await app.inject({ method: "GET", url: `/orders/checkout/${order.stripeCheckoutId}` });
    expect(pub.json()).toMatchObject({ status: "SHIPPED", totalCents: 2499 });
    expect(pub.json().shipments).toHaveLength(1);
    expect(JSON.stringify(pub.json())).not.toMatch(/cost|supplier/i); // never leak supplier data
  });
});

describe("manual purchasing (buy on AliExpress by hand)", () => {
  async function paidFulfillment() {
    const { orderId } = (await checkout([{ productId: "test-order-lamp", quantity: 2 }])).json();
    await payFor(orderId);
    return prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
  }
  const post = (url: string, payload?: object) => app.inject({ method: "POST", url, headers: admin, payload });

  it("queues each paid order with the customer's details and the product's buy link", async () => {
    const f = await paidFulfillment();
    const queue = (await app.inject({ method: "GET", url: "/admin/fulfillments", headers: admin })).json();
    const item = queue.find((x: { id: string }) => x.id === f.id);
    expect(item).toMatchObject({ status: FulfillmentStatus.AWAITING_APPROVAL });
    expect(item.order.shippingAddress).toMatchObject({ name: "Test Buyer", line1: "1 Main St", postalCode: "78701" });
    expect(item.order.email).toBe("buyer@example.com");
    expect(item.items[0]).toMatchObject({ productName: "Test Order Lamp", quantity: 2 });
    expect(item.supplierProduct.url).toBe("https://example.com/item/1");
  });

  it("records bought, shipped and delivered, and shows tracking to the customer", async () => {
    const f = await paidFulfillment();
    const bought = await post(`/admin/fulfillments/${f.id}/purchased`, { supplierOrderId: "AE-8123456789", costCents: 1150 });
    expect(bought.json()).toMatchObject({ status: FulfillmentStatus.SUPPLIER_PAID, supplierOrderId: "AE-8123456789", actualCostCents: 1150 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } })).status).toBe(OrderStatus.FULFILLING);

    const shipped = await post(`/admin/fulfillments/${f.id}/shipped`, { trackingNumber: "LP00123456789CN" });
    expect(shipped.json()).toMatchObject({ status: FulfillmentStatus.SHIPPED, trackingNumber: "LP00123456789CN" });
    expect(shipped.json().trackingUrl).toContain("LP00123456789CN");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } });
    expect(order.status).toBe(OrderStatus.SHIPPED);
    const pub = (await app.inject({ method: "GET", url: `/orders/checkout/${order.stripeCheckoutId}` })).json();
    expect(pub.shipments).toEqual([{ trackingNumber: "LP00123456789CN", trackingUrl: expect.stringContaining("17track") }]);
    expect(JSON.stringify(pub)).not.toMatch(/AE-8123456789|1150|supplier/i); // never leak what we paid or where

    expect((await post(`/admin/fulfillments/${f.id}/delivered`)).json()).toMatchObject({ status: FulfillmentStatus.DELIVERED });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } })).status).toBe(OrderStatus.DELIVERED);
  });

  it("rejects steps out of order, bad input and missing auth", async () => {
    const f = await paidFulfillment();
    expect((await post(`/admin/fulfillments/${f.id}/shipped`, { trackingNumber: "LP00123456789CN" })).statusCode).toBe(409);
    expect((await post(`/admin/fulfillments/${f.id}/purchased`, { supplierOrderId: "" })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/admin/fulfillments/${f.id}/purchased`, payload: { supplierOrderId: "X1" } })).statusCode).toBe(401);
    await post(`/admin/fulfillments/${f.id}/purchased`, { supplierOrderId: "AE-1" });
    expect((await post(`/admin/fulfillments/${f.id}/purchased`, { supplierOrderId: "AE-2" })).statusCode).toBe(409); // never bought twice
  });

  it("cancels an item that can't be bought, with a reason", async () => {
    const f = await paidFulfillment();
    const res = await post(`/admin/fulfillments/${f.id}/cancel`, { note: "Sold out everywhere; refund in Stripe" });
    expect(res.json()).toMatchObject({ status: FulfillmentStatus.CANCELLED, note: "Sold out everywhere; refund in Stripe" });
  });
});
