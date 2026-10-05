import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RoomService } from "./rooms.service.ts";

const listQuery = z.object({
  style: z.string().optional(),
  /** Rooms that feature this product ("Also in N other rooms"). */
  productId: z.string().optional(),
});

export function roomRoutes(rooms: RoomService) {
  return async (app: FastifyInstance) => {
    app.get("/rooms", async (req) => rooms.list(listQuery.parse(req.query)));

    app.get<{ Params: { style: string; room: string } }>("/rooms/:style/:room", async (req, reply) => {
      const room = await rooms.get(req.params.style, req.params.room);
      return room ?? reply.code(404).send({ error: "Room not found" });
    });
  };
}
