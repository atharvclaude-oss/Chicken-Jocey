import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { z } from "zod";
import { FulfillmentStatus } from "../../generated/prisma/enums.ts";
import { hasKey } from "../sourcing/sourcing.routes.ts";
import type { OrderService } from "./orders.service.ts";

const checkoutBody = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(50),
});

export function orderRoutes(orders: OrderService) {
  return async (app: FastifyInstance) => {
    app.post("/checkout", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
      const { items } = checkoutBody.parse(req.body);
      return reply.code(201).send(await orders.createCheckout(items));
    });

    app.get<{ Params: { sessionId: string } }>("/orders/checkout/:sessionId", async (req, reply) => {
      if (!/^cs_[A-Za-z0-9_]+$/.test(req.params.sessionId)) return reply.code(404).send({ error: "Order not found" });
      const order = await orders.publicOrder(req.params.sessionId);
      return order ?? reply.code(404).send({ error: "Order not found" });
    });
  };
}

/** Stripe calls this; the signature check needs the exact raw body, so JSON parsing is off here. */
export function stripeWebhookRoutes(orders: OrderService, stripe: Stripe, webhookSecret: string) {
  return async (app: FastifyInstance) => {
    app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

    app.post("/webhooks/stripe", { config: { rateLimit: false } }, async (req, reply) => {
      const signature = req.headers["stripe-signature"];
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body as Buffer, String(signature ?? ""), webhookSecret);
      } catch {
        return reply.code(400).send({ error: "Invalid signature" });
      }
      await orders.handleEvent(event);
      return { received: true };
    });
  };
}

const statusQuery = z.object({ status: z.enum(FulfillmentStatus).optional() });

/** Ops queue: every supplier purchase waits here for a person to approve it. */
export function adminOrderRoutes(orders: OrderService, adminKey: string) {
  return async (app: FastifyInstance) => {
    app.addHook("onRequest", async (req, reply) => {
      if (!hasKey(req, adminKey)) return reply.code(401).send({ error: "Unauthorized" });
    });
    const config = { rateLimit: { max: 30, timeWindow: "1 minute" } };

    app.get("/fulfillments", { config }, async (req) => orders.listFulfillments(statusQuery.parse(req.query).status));

    app.post<{ Params: { id: string } }>("/fulfillments/:id/approve", { config }, async (req) => {
      return await orders.approveFulfillment(req.params.id);
    });

    app.post<{ Params: { id: string } }>("/fulfillments/:id/tracking", { config }, async (req) => {
      return await orders.refreshTracking(req.params.id);
    });
  };
}
