import Stripe from "stripe";
import { buildApp } from "./app.ts";
import { env } from "./config/env.ts";
import { prisma } from "./db/client.ts";
import { MockSupplierAdapter } from "./modules/suppliers/supplier-adapter.ts";

// Until real supplier adapters exist, orders "buy" at the cost on file.
const mockSuppliers = new MockSupplierAdapter();

const app = await buildApp({
  db: prisma,
  corsOrigins: env.CORS_ORIGINS,
  logger: true,
  rateLimitMax: env.RATE_LIMIT_MAX,
  trustProxy: env.TRUST_PROXY,
  adminApiKey: env.ADMIN_API_KEY,
  payments: env.STRIPE_SECRET_KEY
    ? {
        stripe: new Stripe(env.STRIPE_SECRET_KEY),
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        siteUrl: env.SITE_URL,
        // TODO(suppliers): real Alibaba / AliExpress adapters once those accounts have API access.
        suppliers: () => mockSuppliers,
      }
    : undefined,
});

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
