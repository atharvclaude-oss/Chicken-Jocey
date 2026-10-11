import Stripe from "stripe";
import { buildApp } from "./app.ts";
import { env } from "./config/env.ts";
import { prisma } from "./db/client.ts";
import { resendOrderAlert } from "./modules/notifications/order-alerts.ts";
import { ManualPurchaseAdapter } from "./modules/suppliers/manual-adapter.ts";

// Every order is bought by hand on AliExpress after the customer pays: paid orders queue in
// /admin/orders with the customer's address and the product's AliExpress link. CJdropshipping
// is disconnected (its adapter in modules/suppliers/cj-adapter.ts is kept but not used).
const manualPurchase = new ManualPurchaseAdapter();

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
        suppliers: () => manualPurchase,
        alert:
          env.RESEND_API_KEY && env.ORDER_ALERT_EMAIL
            ? resendOrderAlert({ db: prisma, apiKey: env.RESEND_API_KEY, to: env.ORDER_ALERT_EMAIL, from: env.ORDER_ALERT_FROM, siteUrl: env.SITE_URL })
            : undefined,
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
