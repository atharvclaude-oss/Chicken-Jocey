# Product sourcing

Supplier listings for the products tagged in the 3D rooms. Orders are fulfilled by buying from these listings and shipping to the customer.

**Status: nothing here is verified yet.** The links came from searching AliExpress. AliExpress product pages require a login to view, so live prices, stock, colors and shipping times could not be checked. Before launch, someone on the team must open each link, choose the exact listing and variant, and record the cost.

The data lives in `frontend/services/mock-data.ts` (the `sourcing` map). It is stripped before anything reaches the browser, so customers never see supplier links or costs.

| Product (our name) | Our price | In room | Link type | Supplier link | What to check |
|---|---|---|---|---|---|
| Racing Gaming Chair | $189 | Zeke's Bedroom | Listing | [AliExpress item](https://www.aliexpress.us/item/3256808049031703.html) | Black/white colorway, shipping to US |
| Linen Throw Pillow | $22 | Zeke's Bedroom | Listing | [AliExpress item](https://www.aliexpress.us/item/3256805834494752.html) | 50x50 size; cover only, so source inserts too |
| Oak Gallery Frame | $32 | Both rooms | Listing | [AliExpress item](https://www.aliexpress.us/item/3256807185391953.html) | 50x70 size, white mount included? |
| Tripod Linen Lamp | $54 | Zeke's Bedroom | Search | [Wooden tripod table lamps](https://www.aliexpress.com/w/wholesale-wooden%20tripod%20table%20lamp.html) | ~36 cm, linen drum shade, US plug |
| Cream Plush Rug | $89 | Zeke's Bedroom | Search | [Cream rugs with black border](https://www.aliexpress.us/w/wholesale-cream-rug-with-black-border.html) | ~190x250 cm, shipping weight and cost |
| Woven Plaid Wool Rug | $129 | Graphite Lounge | Search | [Tufted wool rugs](https://www.aliexpress.com/w/wholesale-tufted-wool-rug.html) | Plaid is uncommon; may need another supplier |
| Faux Ficus in Terracotta | $59 | Zeke's Bedroom | Search | [Artificial ficus trees](https://www.aliexpress.com/w/wholesale-artificial-ficus-tree.html) | ~1.3 m; pot often sold separately |
| Arc Floor Lamp | $89 | Graphite Lounge | Search | [Black arc floor lamps](https://www.aliexpress.com/w/wholesale-arc-floor-lamp-black.html) | Dome shade, weighted base, US plug |
| Globe Pendant Light | $42.50 | Graphite Lounge | Search | [Modern pendant lamps](https://www.aliexpress.us/w/wholesale-modern-pendant-lamp.html) | ~30 cm white globe, hardwired vs plug-in |

## Things to decide before selling

- **Retail prices are placeholders.** Set them once costs are known. Shipping cost on large items (rugs, chair, floor lamp) can exceed the item cost.
- **Lead times.** The site says "Ships in 3-5 business days". AliExpress delivery to the US is often 1-3 weeks, so update that copy or use suppliers with US warehouses.
- **Electrical items** (lamps) need US plugs and, ideally, safety certification.
- **Product photos** are renders of the 3D rooms, not supplier photos. Make sure the item you sell actually looks like what's in the room.
