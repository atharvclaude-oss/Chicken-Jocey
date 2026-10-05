import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ProductService } from "./products.service.ts";

const listQuery = z.object({
  style: z.string().optional(),
  category: z.string().optional(),
  /** Comma-separated product ids, e.g. for rehydrating a cart. */
  ids: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(z.string()).max(100))
    .optional(),
});

export function productRoutes(products: ProductService) {
  return async (app: FastifyInstance) => {
    app.get("/products", async (req) => products.list(listQuery.parse(req.query)));

    app.get<{ Params: { slug: string } }>("/products/:slug", async (req, reply) => {
      const product = await products.getBySlug(req.params.slug);
      return product ?? reply.code(404).send({ error: "Product not found" });
    });
  };
}
