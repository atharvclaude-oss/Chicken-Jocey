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
});

export const env = schema.parse(process.env);
