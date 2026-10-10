# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Designed for all audiences, weighted toward **shoppers**: people who browse other people's 3D rooms, find an object they like (a lamp, a pillow, a chair), and buy it. Secondary audiences:

- **Fans of creators**, who come to explore a specific creator's room and buy what is in it (planned: rooms from creators such as MrBeast or Kai Cenat).
- **Room owners**, who upload a short phone video of their room so others can visit it.

The roomcommerce team (not users) builds each room, places the clickable product tags, and fulfils orders. Team-facing tools (e.g. `/admin/tag`) serve this internal job.

## Product Purpose

"Shop the room, not just the product." A user's room becomes a clean, detailed 3D room that anyone can walk through or view from above. Every taggable object in it is clickable: a visitor clicks the lamp, sees it, and adds it to the cart. The team buys the item from a third-party supplier (AliExpress today) and ships it to the customer (dropshipping).

Success means visitors buy objects they discovered inside rooms, and people want their room (or a creator's room) on the site.

## Positioning

Rooms are rebuilt from a real person's room video: layout, sizes and colors are measured from the footage (scan, then SpatialLM layout detection, then baked Blender rendering), not imagined. Each room keeps its owner's real arrangement and palette, restyled to a clean, designed finish. Shopping happens inside the room itself rather than from a product grid.

## Operating Context

- Visitors enter on the homepage, a carousel of 3D rooms, then explore a room in orbit/bird's-eye or walk-through view, click tagged objects, and buy from the product page or cart. A browsable catalogue and product pages exist alongside the rooms.
- Rooms are produced by the team from an owner's phone video (a slow 20 to 40 second walk around the room). Public self-serve upload is planned, not live.
- Product tags are placed manually by the team today; automated tagging is a planned future step.

## Capabilities and Constraints

- Stack: Next.js 16 (App Router), Tailwind v4, Zustand, Motion, React Three Fiber with drei; Fastify + Prisma backend. 3D rooms are baked .glb files (lighting baked into textures, compressed), so the viewer must stay light enough for ordinary laptops and phones.
- Supplier links, supplier costs and sourcing details must never reach the browser; only public product data is shown.
- Checkout (Stripe) is not built yet; the cart exists.
- Rooms are rebuilt somewhat larger than measured (about 15 to 25 percent) so they don't feel cramped on screen, keeping the furniture at real size.
- Terminology: "room" (a 3D scene), "tag" or "hotspot" (a clickable product zone), "catalogue", "creator room".

## Brand Commitments

- Name: Room8 (renamed from the working name "roomcommerce" on 2026-10-09). Logo: two stacked rooms joined by a doorway, reading as an "8" (`frontend/components/brand/Logo.tsx`).
- Voice: **calm and premium**. Understated, confident, design-magazine; let the rooms speak.
- Rooms must look clean and designed, never photoreal scans and never "tacky 3D." The bar is the existing *Graphite Lounge* room (`sleek-lounge-01`): baked lighting, real material textures, considered composition.

## Evidence on Hand

Pre-launch: there are **no** live customers, orders, reviews, signed creator partnerships, or public uploads yet. Future work must not fabricate testimonials, order counts, creator endorsements, press, or user numbers.

Real assets: four baked 3D rooms in `frontend/public/models/` (Graphite Lounge, Living Room, Zeke's Bedroom, Samir's Room; the last two built from real room videos), sourced product data in `backend/data/sourcing.tsv`, and product shots in `frontend/public/models/products/`. Product and room photos in `frontend/public/images/` are partly Unsplash stand-ins.

## Product Principles

1. **The room is the storefront.** Shopping should happen in the room; grids and lists support it, they don't replace it.
2. **True to the real room.** Layout, size relationships and colors come from the owner's actual space; styling refines it, never replaces it.
3. **Quiet confidence.** Premium through restraint: the interface steps back so rooms and objects carry the experience.
4. **Honest commerce.** Never invent social proof; never expose supplier details.
5. **Light enough for everyone.** Rooms must load and move smoothly on ordinary devices, with a photo fallback for low-power ones.
