# backend

Catalogue and room API. Node + TypeScript + Fastify + PostgreSQL + Prisma 7.

**Core rule:** we own products; suppliers only fulfil them. Customers, rooms
and carts point at `Product` / `ProductVariant`. Supplier listings
(`SupplierProduct`) hang off variants and can be swapped without changing
anything a customer sees.

## Run it

```
npm install            # also runs prisma generate
npm run db:dev         # local Postgres (Prisma Dev). Leave running, or add --detach
cp .env.example .env   # paste the postgres:// URL db:dev printed
npm run db:migrate     # apply migrations
npm run db:seed        # load the frontend's mock catalogue (safe to re-run)
npm run dev            # http://localhost:4000
npm test               # unit + API tests (API tests need a seeded DB)
npm run check-sourcing # every shoppable room object -> product -> supplier listing
npm run db:studio      # browse/edit data in the browser
```

## Layout

```
prisma/schema.prisma     the data model: start here
prisma/seed.ts           imports frontend/services/mock-data.ts into the DB
src/modules/<domain>/    one folder per business domain (service + routes)
  products/              public product shape, lifecycle visibility
  rooms/                 rooms, placements, server-computed totals, bundles
  catalogue/             categories, styles, collections
  pricing/               landed cost, margin, suggested retail (pure functions)
  sourcing/              product -> supplier routing, admin fulfilment lookup
src/app.ts               builds the Fastify app (tests use app.inject)
../shared/types.ts       API response types, shared with the frontend
```

## API

All responses match `shared/types.ts`. Prices are integer cents.

| Endpoint | Returns |
|---|---|
| `GET /products?style=&category=&ids=a,b` | `Product[]` (`ids` keeps your order, max 100) |
| `GET /products/:slug` | `Product` |
| `GET /rooms?style=&productId=` | `RoomSummary[]` |
| `GET /rooms/:style/:room` | `RoomDetail`: room plus its products and bundles |
| `GET /categories` | `Category[]` |
| `GET /styles`, `GET /styles/:slug` | `RoomStyle[]`, `RoomStyle` |
| `GET /collections`, `GET /collections/:slug` | `Collection[]`, `CollectionDetail` (published only) |
| `GET /admin/products/:slug/sourcing` | Supplier listings, costs and the listing to fulfil from. Needs `Authorization: Bearer $ADMIN_API_KEY`; disabled when the key is unset |

Unknown routes return JSON `404 {"error":"Not found"}`.

## Checkout, orders and fulfilment

Enabled when `STRIPE_SECRET_KEY` is set (use a **test** key until the Stripe
account is activated). Flow:

```
POST /checkout {items:[{productId, quantity}]}   server prices it, order = PAYMENT_PENDING, returns Stripe Checkout URL
Stripe -> POST /webhooks/stripe                   signature-checked; order = PAID, one fulfilment per supplier listing
GET  /admin/fulfillments                         ops queue: every paid item, with the customer's address and buy link
POST /admin/fulfillments/:id/purchased            bought by hand: {supplierOrderId, costCents?}; order = FULFILLING
POST /admin/fulfillments/:id/shipped              {trackingNumber, trackingUrl?}; order = SHIPPED once every item ships
POST /admin/fulfillments/:id/delivered            order = DELIVERED once every item arrives
POST /admin/fulfillments/:id/cancel               {note}: can't be bought (refund in Stripe)
POST /admin/fulfillments/:id/approve, /tracking   automatic suppliers only (unused while buying by hand)
GET  /orders/checkout/:sessionId                  confirmation page data, incl. tracking (no supplier info)
```

### Manual purchasing (current)

Every order is bought by hand on AliExpress, shipping straight to the customer:

1. The customer pays through Stripe; the webhook marks the order paid and queues each item.
2. The team opens **/admin/orders** on the site (password: `ADMIN_PASSWORD` in
   `frontend/.env.local`, which also holds this API's `ADMIN_API_KEY`). Each item shows the
   customer's name, address, phone and email (with a copy button), what they bought and paid,
   and a "Find on AliExpress" link.
3. Buy the matching listing on AliExpress with the customer's address, then **Mark bought** with
   the AliExpress order number and what it cost (the page shows the margin).
4. When the seller ships, **Mark shipped** with the tracking number: the customer sees it on
   their order page (they're told to bookmark it). Then **Mark delivered**.
5. Can't buy it? **Cancel this item** with a reason, then refund the customer in Stripe.

New-order emails: set `RESEND_API_KEY` (free resend.com account) and `ORDER_ALERT_EMAIL` in
`.env` and every paid order emails a summary with a link to /admin/orders (once per order,
never blocking the payment). Without a verified domain, Resend only delivers to the email on
your Resend account.

### Stock checks

```
npm run check-stock                       # report: in stock, newly out, back in, price changes, thin margins
npm run check-stock -- --apply            # also update the site (unavailable products can't be bought)
npm run check-stock -- --apply --reprice  # also raise prices that fell under the 2x floor
```

Read-only: it never orders anything. Sources: the AliExpress Affiliate API for products with an
exact AliExpress item link (once `ALIEXPRESS_APP_KEY` / `ALIEXPRESS_APP_SECRET` are set), else
CJ's API (`CJ_API_KEY`) for the same product, which shows whether it's still made and sold but
not a specific AliExpress seller's stock. The report is also written to `data/stock-report.md`.
`--apply` updates `data/cj-variants.tsv` and `frontend/services/lamp-offers.ts` (keeping retail
prices, delivery set to the AliExpress window) and reseeds. Retail prices only change with
`--reprice`.

Products route here through `data/product-sourcing.tsv`: `ALIEXPRESS` + `search` rows (an
AliExpress search for the product; swap in an exact item link when you have one). The server
uses `ManualPurchaseAdapter`, which never calls a supplier API. CJdropshipping is disconnected:
its code is kept (`src/modules/suppliers/cj*.ts`, `scripts/fetch-cj.ts`) but not wired in, and
`CJ_API_KEY` is commented out in `.env`.

- The client never sends prices. Paying happens only via the webhook, never the success page.
- Approval stops without spending if the supplier is out of stock, the cost rose more
  than 10%, the margin fell under the floor, or the address is unusable.
- Items with no orderable supplier listing land in `MANUAL_REVIEW`.
- Suppliers sit behind `SupplierAdapter` (`src/modules/suppliers`): `ManualPurchaseAdapter`
  (in use), the CJ adapter (disconnected) and a mock for tests.

Local webhooks: install the Stripe CLI, then
`stripe listen --forward-to localhost:4000/webhooks/stripe` and put the `whsec_...` it
prints in `STRIPE_WEBHOOK_SECRET`. Pay with card `4242 4242 4242 4242`.

## Rate limiting and secrets

- Every route is limited per client IP (`RATE_LIMIT_MAX`, default 120/min;
  `/admin` 30/min). Over the limit: `429` with a `retry-after` header.
  `/health` is exempt. Behind a proxy or load balancer set `TRUST_PROXY=true`,
  or every request looks like it comes from the proxy.
- Secrets (`DATABASE_URL`, `ADMIN_API_KEY`) live only in `backend/.env`, which
  is gitignored. The frontend never holds them: its data layer
  (`frontend/services/`) is `server-only`, and supplier links/costs are served
  only by `/admin`.

## Rules the code enforces

- **Visibility:** only `ACTIVE`, `PAUSED` and `OUT_OF_STOCK` products are
  public. `available` is true only for `ACTIVE` products whose default variant
  is `AVAILABLE` or `LOW_CONFIDENCE`. Drafts and discontinued products drop
  out of rooms and collections automatically.
- **Room totals** are summed from the current variant prices on every request.
  Nothing stores a room price.
- **Default variant** = lowest `position`. Its price, image and colour
  represent the product in listings. A room placement can pin a different
  variant.
- **Price history:** `RetailPriceHistory` and `SupplierPriceHistory` are
  append-only.

## Supplier routing (3D rooms -> AliExpress / Alibaba)

A room object is shoppable when the room spec gives it a `productId`
(`3d-engine/rooms/*.json`). Its 3D model may come from the Poly Haven asset
library or be modelled in code, but what we sell and ship is the product's
supplier listing, never the model:

```
room spec object --productId--> Product --data/product-sourcing.tsv--> supplier listing
                                                     \--sku--> data/sourcing.tsv (item id, cost)
```

- `data/product-sourcing.tsv`: one row per product. `kind=listing` is an exact
  item page (`sku` pulls the item id and cost from `sourcing.tsv`, or give the
  `url` directly); `kind=search` is a curated search link while nobody has
  picked the listing. `platform` is `ALIEXPRESS` or `ALIBABA` (or
  `DISTRIBUTOR`/`OTHER`).
- `npm run db:seed` turns listings into `Supplier`/`SupplierProduct` rows (cost
  history included) and records search links in the product's
  `internalNotes`. Listings start as `UNKNOWN` availability, so nothing is
  ordered from an unchecked page.
- `npm run check-sourcing` fails if a tagged object points at a missing product
  or a product with no sourcing row, and warns for search-only links and
  listings without a cost. Run it after building a room.

To finish a product: open the link, pick the exact item, add it to
`sourcing.tsv` with its cost, set the row in `product-sourcing.tsv` to
`listing` with that `sku`, then re-seed.

## CJdropshipping import (disconnected; kept for reference)

CJ products are imported through CJ's official API (`CJ_API_KEY` in `.env`);
CJ's website is bot-protected, so nothing is scraped.

```
npm run fetch-cj -- lamp-            # verify every CJ row; changes nothing
npm run fetch-cj -- lamp- --apply    # import, then:
npm run db:seed
```

- `data/product-sourcing.tsv`: the CJ product URL (`…-p-<pid>.html`) and, in
  `option`, the exact variant name as CJ shows it (colour, size, US plug).
- The import checks each listing is on sale, finds that variant, and reads its
  price, packed size, stock and the cheapest US shipping. Rows that fail (gone,
  off sale, variant missing, no US shipping, two products on one variant) are
  listed and left unbuyable.
- `data/cj-variants.tsv` (written): variant id, costs, stock, package. The seed
  makes these orderable supplier listings; fulfilment orders by variant id.
- `frontend/services/lamp-offers.ts` (written): retail price at the 2× floor
  on item + shipping, buyable or not, delivery estimate, package size, photo.
- `data/cj-photos.tsv`: the chosen photo per product, from that product's own
  CJ listing, with an optional crop (`x0,y0,x1,y1` fractions) to drop spec
  text. Saved as `frontend/public/images/products/<slug>-cj.jpg`.

With `CJ_API_KEY` set, approving a fulfilment re-checks CJ's live stock and
price and creates the CJ order unpaid (pay it in CJ: My CJ > Orders); tracking
comes back from CJ.

## Not built yet

- Admin/ingestion endpoints (`POST /admin/products`, supplier URL import from the admin UI)
- Supplier selection, availability sync jobs, margin alerts
- Cart, checkout, orders, payments (Atharv's side)

## Pricing the sourcing sheet

The company floor is **retail ≥ 2× landed cost** (item + shipping), i.e. at
least a 50% gross margin before payment fees. It lives in
`src/modules/pricing/pricing.ts` (`MIN_MARKUP`).

1. Fill `unit_cost_usd` and `shipping_usd` in `data/sourcing.tsv` (blank
   shipping = free shipping).
2. `npm run price-sheet` writes `data/sourcing-priced.csv` with landed cost,
   retail (first .99 at or above 2×), markup and margin. It refuses to run if
   SKUs or AliExpress item ids are duplicated or an id was mangled by Excel.
