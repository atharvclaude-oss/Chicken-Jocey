import type { FastifyInstance } from "fastify";
import type { CatalogueService } from "./catalogue.service.ts";

export function catalogueRoutes(catalogue: CatalogueService) {
  return async (app: FastifyInstance) => {
    app.get("/categories", async () => catalogue.categories());

    app.get("/styles", async () => catalogue.styles());

    app.get<{ Params: { slug: string } }>("/styles/:slug", async (req, reply) => {
      const style = await catalogue.style(req.params.slug);
      return style ?? reply.code(404).send({ error: "Style not found" });
    });

    app.get("/collections", async () => catalogue.collections());

    app.get<{ Params: { slug: string } }>("/collections/:slug", async (req, reply) => {
      const collection = await catalogue.collection(req.params.slug);
      return collection ?? reply.code(404).send({ error: "Collection not found" });
    });
  };
}
