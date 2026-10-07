import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { SourcingService } from "./sourcing.service.ts";

export function hasKey(req: FastifyRequest, key: string): boolean {
  const given = Buffer.from(req.headers.authorization?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Internal routes for the ops team (supplier links, costs). Every request needs
 * `Authorization: Bearer <ADMIN_API_KEY>`. Registered under /admin with a
 * stricter rate limit; not registered at all when no key is configured.
 */
export function adminSourcingRoutes(sourcing: SourcingService, adminKey: string) {
  return async (app: FastifyInstance) => {
    app.addHook("onRequest", async (req, reply) => {
      if (!hasKey(req, adminKey)) return reply.code(401).send({ error: "Unauthorized" });
    });

    // Tighter than the public API: this guards a secret, so slow down guessing.
    const config = { rateLimit: { max: 30, timeWindow: "1 minute" } };

    app.get<{ Params: { slug: string } }>("/products/:slug/sourcing", { config }, async (req, reply) => {
      const view = await sourcing.forProduct(req.params.slug);
      return view ?? reply.code(404).send({ error: "Product not found" });
    });
  };
}
