import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError } from "fastify";
import type Stripe from "stripe";
import { ZodError } from "zod";
import type { Db } from "./db/client.ts";
import { catalogueRoutes } from "./modules/catalogue/catalogue.routes.ts";
import { CatalogueService } from "./modules/catalogue/catalogue.service.ts";
import { productRoutes } from "./modules/products/products.routes.ts";
import { ProductService } from "./modules/products/products.service.ts";
import { roomRoutes } from "./modules/rooms/rooms.routes.ts";
import { RoomService } from "./modules/rooms/rooms.service.ts";
import { adminOrderRoutes, orderRoutes, stripeWebhookRoutes } from "./modules/orders/orders.routes.ts";
import { OrderService } from "./modules/orders/orders.service.ts";
import { adminSourcingRoutes } from "./modules/sourcing/sourcing.routes.ts";
import { SourcingService } from "./modules/sourcing/sourcing.service.ts";
import type { SupplierRegistry } from "./modules/suppliers/supplier-adapter.ts";

export interface AppOptions {
  db: Db;
  corsOrigins?: string[];
  logger?: boolean;
  /** Requests per client IP per minute. */
  rateLimitMax?: number;
  trustProxy?: boolean;
  /** Enables /admin routes. Leave unset to disable them. */
  adminApiKey?: string;
  /** Enables checkout, orders and fulfilment. */
  payments?: {
    stripe: Stripe;
    /** Enables POST /webhooks/stripe. */
    webhookSecret?: string;
    suppliers: SupplierRegistry;
    siteUrl: string;
  };
}

/** Builds the app without listening, so tests can use app.inject(). */
export async function buildApp({
  db,
  corsOrigins = [],
  logger = false,
  rateLimitMax = 120,
  trustProxy = false,
  adminApiKey,
  payments,
}: AppOptions) {
  const app = Fastify({ logger, trustProxy });

  await app.register(cors, { origin: corsOrigins });
  await app.register(rateLimit, {
    max: rateLimitMax,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: "Too many requests",
      message: `Rate limit exceeded, retry in ${ctx.after}`,
    }),
  });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid request", issues: err.issues });
    }
    // Client errors (429 rate limit, malformed JSON, ...) keep their status.
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    app.log.error(err);
    return reply.code(500).send({ error: "Internal server error" });
  });

  // Rate-limited too, so probing for routes counts against the limit.
  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (req, reply) =>
    reply.code(404).send({ error: "Not found", path: req.url.split("?")[0] }),
  );

  app.get("/health", { config: { rateLimit: false } }, async () => ({ ok: true }));

  await app.register(productRoutes(new ProductService(db)));
  await app.register(roomRoutes(new RoomService(db)));
  await app.register(catalogueRoutes(new CatalogueService(db)));
  const orders = payments && new OrderService(db, payments.stripe, payments.suppliers, payments.siteUrl);
  if (orders) {
    await app.register(orderRoutes(orders));
    if (payments.webhookSecret) await app.register(stripeWebhookRoutes(orders, payments.stripe, payments.webhookSecret));
  }
  if (adminApiKey) {
    await app.register(adminSourcingRoutes(new SourcingService(db), adminApiKey), { prefix: "/admin" });
    if (orders) await app.register(adminOrderRoutes(orders, adminApiKey), { prefix: "/admin" });
  }

  return app;
}
