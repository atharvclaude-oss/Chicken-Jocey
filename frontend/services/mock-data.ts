// Mock dataset standing in for the backend API until it exists.
// Only the services/ layer imports this file. Swap each service function to a
// real fetch() when the backend endpoints land; nothing else needs to change.
//

import type { Product, RoomStyle } from "@shared/types";

export const styles: RoomStyle[] = [
  {
    slug: "sleek-masculine",
    name: "Sleek Masculine",
    tagline: "Dark linens, matte black, low warm light.",
    coverImage: "/images/rooms/hero.jpg",
  },
  {
    slug: "warm-minimal",
    name: "Warm Minimal",
    tagline: "Raw oak, soft whites and very little else.",
    coverImage: "/images/rooms/oak-and-linen.jpg",
  },
  {
    slug: "dark-academia",
    name: "Dark Academia",
    tagline: "Old books, brass lamps, deep wood.",
    coverImage: "/images/rooms/dark-academia-cover.jpg",
  },
  {
    slug: "gaming-minimal",
    name: "Gaming Minimal",
    tagline: "A clean desk that still means business.",
    coverImage: "/images/rooms/gaming-cover.jpg",
  },
  {
    slug: "modern-luxury",
    name: "Modern Luxury",
    tagline: "Hotel-suite calm with a few loud pieces.",
    coverImage: "/images/rooms/gallery-suite.jpg",
  },
  {
    slug: "neocolonial",
    name: "Neocolonial",
    tagline: "Leather, mahogany and firelight, done with restraint.",
    coverImage: "/images/rooms/neocolonial-parlour.jpg",
  },
];

// The catalogue is empty for now: rooms are on show, nothing is for sale yet.
export const products: Product[] = [];
