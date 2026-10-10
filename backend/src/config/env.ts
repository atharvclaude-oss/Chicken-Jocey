import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().default(4000),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  /** Requests per client IP per minute across the public API. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  /** Set when running behind a proxy/load balancer so rate limits see the real client IP. */
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /**
   * Bearer token for /admin routes (supplier links and costs). Server-side
   * only: never put it in the frontend or a NEXT_PUBLIC_ variable. When unset,
   * /admin routes are disabled.
   */
  ADMIN_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(32, "ADMIN_API_KEY must be at least 32 characters").optional(),
  ),
  /** Stripe secret key. Use a test key (sk_test_/rk_test_) until the account is activated. Unset = checkout disabled. */
  STRIPE_SECRET_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().startsWith("sk_").or(z.string().startsWith("rk_")).optional()),
  /** Signing secret for POST /webhooks/stripe (whsec_...). Unset = webhook disabled. */
  STRIPE_WEBHOOK_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().startsWith("whsec_").optional()),
  /** CJdropshipping API key. Set = CJ listings are checked and ordered through CJ's API; unset = mock supplier. */
  CJ_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  /** Storefront origin, for Stripe's success/cancel redirects and product images. */
  SITE_URL: z.string().url().default("http://localhost:3000"),
});

export const env = schema.parse(process.env);
