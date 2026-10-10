// Links picked CJdropshipping products to the catalogue.
//
//   npm run cj:apply            apply every pick in data/cj-picks.json
//   npm run cj:apply -- --dry   show what would change, write nothing
//
// data/cj-picks.json: { "<product id>": { "pid": "...", "vid": "..." }, ... }
//
// For each pick it re-reads the exact variant from CJ, takes the cheapest
// shipping option to the US, and prices it at the company floor (retail >= 2x
// landed cost, ending in .99). Then it writes:
//   - data/cj-listings.tsv                       private: CJ ids, costs, logistics (seeded as the supplier listing)
//   - frontend/services/catalog-offers.json      public: price, photo, shipping window, availability
//   - frontend/public/images/products/<id>-<vid>.jpg   the variant's photo, shown wherever the product appears
// Re-run any time to refresh prices and stock. `npm run db:seed` loads the result.

import "dotenv/config";
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bestRoute, CjClient, shipFrom, usdToCents } from "../src/modules/suppliers/cj-client.ts";
import { landedCostCents, MIN_MARGIN, suggestRetailCents } from "../src/modules/pricing/pricing.ts";
import { CJ_COLUMNS, DATA_DIR, parseCjListingRows, type CjListingRow } from "../src/modules/sourcing/sourcing-sheet.ts";
import { cjProductUrl } from "./cj-search.ts";

const FRONTEND = fileURLToPath(new URL("../../frontend/", import.meta.url));
const OFFERS = `${FRONTEND}services/catalog-offers.json`;
const IMAGES = `${FRONTEND}public/images/products/`;
const LISTINGS = `${DATA_DIR}cj-listings.tsv`;

/** "7-12" -> "Ships in 7–12 days"; anything unparseable falls back to the raw text. */
export function shippingEstimate(aging: string): string {
  const m = aging.match(/(\d+)\s*-\s*(\d+)/);
  if (m) return `Ships in ${m[1]}–${m[2]} days`;
  const one = aging.match(/(\d+)/);
  return one ? `Ships in ${one[1]} days` : "Ships from our partner warehouse";
}

/** Retail price at the company floor (>= 2x landed, .99 ending). */
export const retailFor = (unitCostCents: number, shippingCostCents: number) =>
  suggestRetailCents(landedCostCents({ unitCostCents, shippingCostCents }), MIN_MARGIN);

async function main() {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new Error("Set CJ_API_KEY in backend/.env (CJ dashboard > Authorization > API).");
  const dry = process.argv.includes("--dry");
  const picks = JSON.parse(readFileSync(`${DATA_DIR}cj-picks.json`, "utf8")) as Record<string, { pid: string; vid: string } | string>;
  const offers = JSON.parse(readFileSync(OFFERS, "utf8")) as Record<string, unknown>;
  const rows = new Map(parseCjListingRows(readFileSync(LISTINGS, "utf8")).map((r) => [r.product_slug, r]));
  const cj = new CjClient(apiKey, { tokenFile: fileURLToPath(new URL("../.cj-token.json", import.meta.url)) });
  mkdirSync(IMAGES, { recursive: true });

  for (const [slug, pick] of Object.entries(picks)) {
    if (slug.startsWith("_") || typeof pick === "string") continue;
    try {
      const product = await cj.product(pick.pid);
      const variant = product.variants.find((v) => v.vid === pick.vid);
      if (!variant) throw new Error(`variant ${pick.vid} not found on CJ product ${pick.pid}`);
      const from = shipFrom(variant);
      const route = await bestRoute(cj, { vid: variant.vid, quantity: 1, endCountryCode: "US", prefer: from.stock ? from.countryCode : undefined });
      if (!route) throw new Error("CJ has no shipping route to the US from any warehouse");
      const freight = route.option;

      const unit = usdToCents(variant.variantSellPrice);
      const ship = usdToCents(freight.logisticPrice);
      const price = retailFor(unit, ship);
      const inStock = from.stock !== 0;
      console.log(
        `${slug}: ${product.productNameEn.slice(0, 60)} [${variant.variantKey ?? ""}] cost $${(unit / 100).toFixed(2)} + ship $${(ship / 100).toFixed(2)} (${route.from} ${freight.logisticName}, ${freight.logisticAging}d) -> $${(price / 100).toFixed(2)}${inStock ? "" : " OUT OF STOCK"}`,
      );
      if (dry) continue;

      const imageUrl = variant.variantImage || product.bigImage;
      const img = await fetch(imageUrl);
      if (!img.ok) throw new Error(`image download failed (${img.status}) for ${imageUrl}`);
      // One file per exact variant, so a new pick gets a new URL (no stale image caches).
      const file = `${slug}-${variant.vid.slice(-8)}.jpg`;
      for (const f of readdirSync(IMAGES)) if (f.startsWith(`${slug}-`) || f === `${slug}.jpg`) unlinkSync(`${IMAGES}${f}`);
      writeFileSync(`${IMAGES}${file}`, Buffer.from(await img.arrayBuffer()));

      const row: CjListingRow = {
        product_slug: slug,
        pid: product.pid,
        vid: variant.vid,
        variant: variant.variantKey ?? "",
        unit_cost_usd: (unit / 100).toFixed(2),
        shipping_usd: (ship / 100).toFixed(2),
        logistic: freight.logisticName,
        ship_from: route.from,
        delivery_days: freight.logisticAging,
        in_stock: inStock ? "yes" : "no",
        url: cjProductUrl(product.pid),
        checked_at: new Date().toISOString().slice(0, 10),
        notes: rows.get(slug)?.notes ?? "",
      };
      rows.set(slug, row);
      offers[slug] = {
        priceCents: price,
        image: `/images/products/${file}`,
        shippingEstimate: shippingEstimate(freight.logisticAging),
        available: inStock,
        // Name, colour, description and size stay in room-catalog.json, written to describe this exact item.
        // (CJ's variant dimensions are the shipping package, not the product, so they're not used.)
      };
    } catch (err) {
      console.error(`${slug}: ${(err as Error).message}`);
    }
  }

  if (dry) return;
  const tsv = [CJ_COLUMNS.join("\t"), ...[...rows.values()].map((r) => CJ_COLUMNS.map((c) => r[c].replace(/[\t\n]/g, " ")).join("\t"))].join("\n");
  writeFileSync(LISTINGS, `${tsv}\n`);
  writeFileSync(OFFERS, `${JSON.stringify(offers, null, 2)}\n`);
  console.log(`\nWrote ${rows.size} CJ listings and ${Object.keys(offers).length} public offers. Run npm run db:seed to load them.`);
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/cj-apply.ts");
if (isMain) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  });
}
