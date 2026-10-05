# Product sourcing

Supplier listings for the products tagged in the 3D rooms. Orders are fulfilled by buying from these listings and shipping to the customer.

**Status: nothing here is verified yet.** The links came from searching AliExpress. AliExpress product pages require a login to view, so live prices, stock, colors and shipping times could not be checked. Before launch, someone on the team must open each link, choose the exact listing and variant, and record the cost.

**Source of truth: `backend/data/sourcing.tsv`.** Fill in `unit_cost_usd` / `shipping_usd` there and run `npm run price-sheet` in `backend/` to get retail prices at the 2x floor (see `backend/README.md`). The three items with exact listings are already in that sheet (SKUs below). The six "search" items need someone to pick an exact listing first; then add them to the sheet as new rows.

The frontend mirrors these links in `frontend/services/mock-data.ts` (the `sourcing` map) until it reads from the backend. They're stripped before anything reaches the browser, so customers never see supplier links or costs.

| Product (our name) | Our price | In room | Sheet SKU | Supplier link | What to check |
|---|---|---|---|---|---|
| Racing Gaming Chair | $189 | Zeke's Bedroom | GM-CHAIR-001 | [AliExpress item](https://www.aliexpress.us/item/3256808049031703.html) | Black/white colorway, shipping to US |
| Linen Throw Pillow | $22 | Zeke's Bedroom | WM-PILL-002 | [AliExpress item](https://www.aliexpress.us/item/3256805834494752.html) | 50x50 size; cover only, so source inserts too |
| Oak Gallery Frame | $32 | Both rooms | WM-FRAM-001 | [AliExpress item](https://www.aliexpress.us/item/3256807185391953.html) | 50x70 size, white mount included? |
| Tripod Linen Lamp | $54 | Zeke's Bedroom | Not yet (search) | [Wooden tripod table lamps](https://www.aliexpress.com/w/wholesale-wooden%20tripod%20table%20lamp.html) | ~36 cm, linen drum shade, US plug |
| Cream Plush Rug | $89 | Zeke's Bedroom | Not yet (search) | [Cream rugs with black border](https://www.aliexpress.us/w/wholesale-cream-rug-with-black-border.html) | ~190x250 cm, shipping weight and cost |
| Woven Plaid Wool Rug | $129 | Graphite Lounge | Not yet (search) | [Tufted wool rugs](https://www.aliexpress.com/w/wholesale-tufted-wool-rug.html) | Plaid is uncommon; may need another supplier |
| Faux Ficus in Terracotta | $59 | Zeke's Bedroom | Not yet (search) | [Artificial ficus trees](https://www.aliexpress.com/w/wholesale-artificial-ficus-tree.html) | ~1.3 m; pot often sold separately |
| Arc Floor Lamp | $89 | Graphite Lounge | Not yet (search) | [Black arc floor lamps](https://www.aliexpress.com/w/wholesale-arc-floor-lamp-black.html) | Dome shade, weighted base, US plug |
| Globe Pendant Light | $42.50 | Graphite Lounge | Not yet (search) | [Modern pendant lamps](https://www.aliexpress.us/w/wholesale-modern-pendant-lamp.html) | ~30 cm white globe, hardwired vs plug-in |

## Things to decide before selling

- **Retail prices in the frontend are placeholders.** Once costs are in the sheet, use the prices `npm run price-sheet` produces (2x landed cost minimum). Shipping cost on large items (rugs, chair, floor lamp) can exceed the item cost.
- **Lead times.** The site says "Ships in 3-5 business days". AliExpress delivery to the US is often 1-3 weeks, so update that copy or use suppliers with US warehouses.
- **Electrical items** (lamps) need US plugs and, ideally, safety certification.
- **Product photos** are renders of the 3D rooms, not supplier photos. Make sure the item you sell actually looks like what's in the room.
