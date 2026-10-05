import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import type { Db } from "./db/client.ts";
import { catalogueRoutes } from "./modules/catalogue/catalogue.routes.ts";
import { CatalogueService } from "./modules/catalogue/catalogue.service.ts";
import { productRoutes } from "./modules/products/products.routes.ts";
import { ProductService } from "./modules/products/products.service.ts";
import { roomRoutes } from "./modules/rooms/rooms.routes.ts";
import { RoomService } from "./modules/rooms/rooms.service.ts";

export interface AppOptions {
  db: Db;
  corsOrigins?: string[];
  logger?: boolean;
}

/** Builds the app without listening, so tests can use app.inject(). */
export async function buildApp({ db, corsOrigins = [], logger = false }: AppOptions) {
  const app = Fastify({ logger });

  await app.register(cors, { origin: corsOrigins });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid request", issues: err.issues });
    }
    app.log.error(err);
    return reply.code(500).send({ error: "Internal server error" });
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(productRoutes(new ProductService(db)));
  await app.register(roomRoutes(new RoomService(db)));
  await app.register(catalogueRoutes(new CatalogueService(db)));

  return app;
}
