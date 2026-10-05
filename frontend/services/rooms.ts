import type { RoomStyle, RoomSummary, Room } from "@shared/types";
import { products, rooms, styles } from "./mock-data";

// TODO(backend): replace mock lookups with fetch(`${API_URL}/rooms/...`).
// Totals are computed here only because there is no backend yet; the real
// API returns them so pricing stays server-authoritative.

function summarize(room: Room): RoomSummary {
  const totalCents = room.assets.reduce((sum, asset) => {
    const product = products.find((p) => p.id === asset.productId);
    return sum + (product?.priceCents ?? 0);
  }, 0);
  return { ...room, totalCents, productCount: room.assets.length };
}

export async function getStyles(): Promise<RoomStyle[]> {
  return styles;
}

export async function getStyle(slug: string): Promise<RoomStyle | null> {
  return styles.find((s) => s.slug === slug) ?? null;
}

export async function getRooms(styleSlug?: string): Promise<RoomSummary[]> {
  return rooms
    .filter((r) => !styleSlug || r.styleSlug === styleSlug)
    .map(summarize);
}

export async function getRoom(styleSlug: string, roomSlug: string): Promise<RoomSummary | null> {
  const room = rooms.find((r) => r.styleSlug === styleSlug && r.slug === roomSlug);
  return room ? summarize(room) : null;
}

export async function getRoomsContainingProduct(productId: string): Promise<RoomSummary[]> {
  return rooms
    .filter((r) => r.assets.some((a) => a.productId === productId))
    .map(summarize);
}

/** Cheapest complete-room price per style, for "from $X" labels. */
export async function getStyleStartingPrices(): Promise<Record<string, number>> {
  const all = await getRooms();
  const result: Record<string, number> = {};
  for (const r of all) {
    result[r.styleSlug] = Math.min(result[r.styleSlug] ?? Infinity, r.totalCents);
  }
  return result;
}
