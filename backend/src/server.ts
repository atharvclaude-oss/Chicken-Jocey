import Stripe from "stripe";
import { buildApp } from "./app.ts";
import { env } from "./config/env.ts";
import { prisma } from "./db/client.ts";
import { fileURLToPath } from "node:url";
import { CjSupplierAdapter } from "./modules/suppliers/cj-adapter.ts";
import { CjClient } from "./modules/suppliers/cj-client.ts";
import { MockSupplierAdapter, type SupplierRegistry } from "./modules/suppliers/supplier-adapter.ts";

// CJdropshipping listings order through the CJ API when CJ_API_KEY is set.
// Other platforms (and CJ without a key) "buy" at the cost on file.
const mockSuppliers = new MockSupplierAdapter();
const cjSuppliers = env.CJ_API_KEY
  ? new CjSupplierAdapter(new CjClient(env.CJ_API_KEY, { tokenFile: fileURLToPath(new URL("../.cj-token.json", import.meta.url)) }))
  : null;
const suppliers: SupplierRegistry = (platform) => (platform === "CJDROPSHIPPING" && cjSuppliers) || mockSuppliers;

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
        suppliers,
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
