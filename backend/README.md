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

## Not built yet

- Admin/ingestion endpoints (`POST /admin/products`, supplier URL import)
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
