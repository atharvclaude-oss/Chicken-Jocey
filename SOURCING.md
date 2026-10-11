# Product sourcing

## Manual AliExpress purchasing (current path)

Since 2026-10-11 every order is bought by hand on AliExpress after the customer pays, and shipped
straight to them. Each product's row in `backend/data/product-sourcing.tsv` is an `ALIEXPRESS`
`search` link built from its name (its notes keep the CJ link it was sourced from, which shows
exactly which product to look for). Paid orders queue at `/admin/orders`; see the backend README,
"Manual purchasing". To use an exact AliExpress item instead of a search, replace the row's URL
with the item page and set `kind` to `listing`.

## CJdropshipping (disconnected; kept for reference)

Every product is fulfilled by one exact CJdropshipping product + variant: the lamp collections and every object in the 3D rooms (`frontend/services/room-catalog.json` maps each glTF object to a product). One pipeline handles both:

1. `CJ_API_KEY` in `backend/.env` (cjdropshipping.com > My CJ > Authorization > API).
2. Find a product: `npm run cj:search -- <product id>` (in `backend/`) searches CJ with the keywords in `data/cj-search.json` and writes a visual review page, `data/cj-candidates/index.html`. Only pick listings CJ can ship to the US.
3. Add the pick to `data/product-sourcing.tsv` as a `CJDROPSHIPPING` `listing`: its CJ product URL and, in `option`, the variant name exactly as CJ shows it. One CJ variant can back only one product.
4. `npm run fetch-cj -- <slug prefix> --apply` verifies it on CJ (on sale, exact variant, stock) and finds the best route to the US: CJ's US warehouse first (furniture often ships only, and free, from there), then China and CJ's other warehouses, preferring delivery within 20 days. It writes cost, shipping and stock to `data/cj-variants.tsv` (private), price, delivery and photo to `frontend/services/lamp-offers.ts` (public), and the photo to `frontend/public/images/products/`. Retail is the 2x floor on item + shipping.
5. `npm run db:seed` loads the listings; `npm run check-sourcing` confirms every room object maps to a product with a listing.

Until a room product is imported it shows as "coming soon": clickable in its room and listed in the room's featured catalogue (`/rooms/<room id>`), not buyable. Paid orders wait for admin approval; approval re-checks CJ's live stock and price and creates the CJ order **unpaid**, shipped from the best warehouse. Pay it in the CJ dashboard (My CJ > Orders); tracking comes back from CJ.

Room products with no US-shippable match on CJ yet: 27-inch monitor, grandfather clock, framed oil portrait, checkerboard print, two-drawer nightstand, zebra roller blind, wingback armchair, velvet curtains.

## Older marketplace sourcing (AliExpress / Alibaba)

Supplier listings for the products tagged in the 3D rooms. Orders are fulfilled by buying from these listings and shipping to the customer. Customers never see supplier links or costs.

**Status: nothing here is verified yet.** The links came from searching AliExpress and Alibaba. AliExpress pages require a login to view, so live prices, stock, colors and shipping times could not be checked. Before launch, someone on the team must open each link, choose the exact listing and variant, and record the cost.

## Where it lives

| File | What it holds |
|---|---|
| `backend/data/product-sourcing.tsv` | **Which listing fulfils each product.** One row per product: platform (AliExpress/Alibaba), `listing` (exact item page) or `search` (no listing picked yet), sheet SKU, option to choose, notes. |
| `backend/data/sourcing.tsv` | The priced AliExpress sheet: item ids, unit cost, shipping. `npm run price-sheet` prices it at the 2x floor. |

`npm run check-sourcing` (in `backend/`) walks every tagged object in `3d-engine/rooms/*.json` and prints the room → product → supplier chain, failing on broken links. `npm run db:seed` loads the listings into the database, where `GET /admin/products/:slug/sourcing` (admin key required) returns the listing to order from. See `backend/README.md`.

## Status by product (21 products across 3 rooms)

**Exact listing, in the sheet (needs cost):** Racing Gaming Chair (GM-CHAIR-001), Linen Throw Pillow (WM-PILL-002), Oak Gallery Frame (WM-FRAM-001), Ceramic Bud Vase (WM-VASE-003).

**Exact listing, candidate only (open it, confirm, then add to the sheet):**
- Arc Floor Lamp: [AliExpress 3256807252068840](https://www.aliexpress.us/item/3256807252068840.html). Confirm black dome shade, weighted base, US plug.
- Globe Pendant Light and the living-room Globe Pendant: [AliExpress 32964632672](https://www.aliexpress.com/item/32964632672.html), 30cm and 35cm options. Confirm both sizes exist.

**Search link only (pick a listing):**
- AliExpress: Tripod Linen Lamp, Cream Plush Rug, Woven Plaid Wool Rug (plaid is uncommon), Faux Ficus, Oak Side Table, Plaid Wool Area Rug, Checkerboard Print, Potted Fern, Potted Monstera.
- Alibaba (large furniture, needs a freight quote and MOQ check): Chesterfield Sofa, Leather Lounge Armchair, Oak Coffee Table, Walnut Media Console, Worn Oak Bookshelf.

The full links and what to check for each are in `backend/data/product-sourcing.tsv`.

## Things to decide before selling

- **Retail prices in the frontend are placeholders.** Once costs are in the sheet, use the prices `npm run price-sheet` produces (2x landed cost minimum). Shipping cost on large items (rugs, chair, floor lamp, all the living-room furniture) can exceed the item cost.
- **Lead times.** The site says "Ships in 3-5 business days". AliExpress delivery to the US is often 1-3 weeks and Alibaba freight longer, so update that copy or use suppliers with US warehouses.
- **Electrical items** (lamps) need US plugs and, ideally, safety certification.
- **Product photos** are renders of the 3D rooms, not supplier photos. Make sure the item you sell actually looks like what's in the room.
- **Untagged room objects.** Some objects in the rooms (e.g. the lounge's cabinet, chairs and plants) have no `productId`, so they aren't shoppable. Tag them and add a sourcing row to sell them.
