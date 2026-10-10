# Product sourcing

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
