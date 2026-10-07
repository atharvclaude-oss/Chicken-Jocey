import { buildApp } from "./app.ts";
import { env } from "./config/env.ts";
import { prisma } from "./db/client.ts";

const app = await buildApp({
  db: prisma,
  corsOrigins: env.CORS_ORIGINS,
  logger: true,
  rateLimitMax: env.RATE_LIMIT_MAX,
  trustProxy: env.TRUST_PROXY,
  adminApiKey: env.ADMIN_API_KEY,
});

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
