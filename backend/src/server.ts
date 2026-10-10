import Stripe from "stripe";
import { buildApp } from "./app.ts";
import { env } from "./config/env.ts";
import { prisma } from "./db/client.ts";
import { CjClient } from "./modules/suppliers/cj.ts";
import { CjSupplierAdapter } from "./modules/suppliers/cj-adapter.ts";
import { MockSupplierAdapter } from "./modules/suppliers/supplier-adapter.ts";

// CJ listings go through CJ's API when a key is set. Platforms without an API
// adapter yet "buy" at the cost on file.
const mockSuppliers = new MockSupplierAdapter();
const cjSupplier = env.CJ_API_KEY ? new CjSupplierAdapter(new CjClient(env.CJ_API_KEY)) : null;

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
        suppliers: (platform) => (platform === "CJDROPSHIPPING" && cjSupplier) || mockSuppliers,
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
