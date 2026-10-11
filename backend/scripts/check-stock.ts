// Checks every product's stock and supplier price, and (with --apply) updates the storefront so
// out-of-stock products can't be bought and restocked ones can again.
//
//   npm run check-stock                        report only (also written to data/stock-report.md)
//   npm run check-stock -- --apply             update stock on the site: offers file + database
//   npm run check-stock -- --apply --reprice   also raise prices that fell under the 2x floor
//   npm run check-stock -- lamp-               only products whose slug starts with "lamp-"
//
// Sources, read-only (nothing is ever ordered here):
//   1. AliExpress Affiliate API, for products with an exact AliExpress item link, once
//      ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET are in backend/.env.
//   2. CJdropshipping API (CJ_API_KEY), for every product imported from CJ: the same product,
//      so a strong signal that it's still made and sold, though not a specific AliExpress
//      seller's stock.
// Products with neither stay as they were and are listed as "not checked".
//
// Orders are bought by hand on AliExpress, so delivery shows the AliExpress window and retail
// prices are never changed unless --reprice is passed.

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { floorRetailCents, landedCostCents, MIN_MARKUP } from "../src/modules/pricing/pricing.ts";
import { DATA_DIR, parseCjVariants, type CjVariantRow } from "../src/modules/sourcing/sourcing-sheet.ts";
import { CjClient, usdToCents, type CjProduct } from "../src/modules/suppliers/cj.ts";
import { call as aliexpressCall } from "./fetch-aliexpress.ts";
import { offersSource, variantsTsv } from "./fetch-cj.ts";

const OFFERS_FILE = fileURLToPath(new URL("../../frontend/services/lamp-offers.ts", import.meta.url));
const VARIANTS = `${DATA_DIR}cj-variants.tsv`;
const SOURCING = `${DATA_DIR}product-sourcing.tsv`;
const REPORT = `${DATA_DIR}stock-report.md`;
const ON_SALE = "3";

/** Bought by hand on AliExpress and shipped from China: a realistic window to the US. */
export const ALIEXPRESS_DELIVERY = "Arrives in 10-25 business days";

/** Current retail prices, read from the generated offers file. */
export function parseOfferPrices(source: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of source.matchAll(/"([^"]+)": \{ priceCents: (\d+)/g)) out[m[1]!] = Number(m[2]);
  return out;
}

export type StockState = "in-stock" | "out-of-stock" | "gone" | "not-checked";

export interface StockResult {
  slug: string;
  source: "aliexpress" | "cj" | "none";
  before: number;
  after: number;
  state: StockState;
  costBefore: number;
  costAfter: number;
  retail: number;
  note: string;
}

/** Retail vs. landed cost: the multiple must stay at or above MIN_MARKUP (2x). */
export const markup = (retail: number, landed: number) => (landed > 0 ? retail / landed : Infinity);

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const pause = () => new Promise((r) => setTimeout(r, 1100));

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const reprice = args.includes("--reprice");
  const prefix = args.find((a) => !a.startsWith("--")) ?? "";

  const rows = parseCjVariants(readFileSync(VARIANTS, "utf8"));
  const prices = existsSync(OFFERS_FILE) ? parseOfferPrices(readFileSync(OFFERS_FILE, "utf8")) : {};
  const sourcing = new Map(
    readFileSync(SOURCING, "utf8")
      .replace(/\r/g, "")
      .split("\n")
      .slice(1)
      .filter(Boolean)
      .map((l) => l.split("\t"))
      .map((c) => [c[0]!, { platform: c[1]!, kind: c[2]!, url: c[4]! }] as const),
  );
  const cj = process.env.CJ_API_KEY ? new CjClient(process.env.CJ_API_KEY) : null;
  const aeKeys = !!(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET);
  if (!cj && !aeKeys) throw new Error("No stock source: set CJ_API_KEY (read-only) or the AliExpress Affiliate keys in backend/.env");

  const today = new Date().toISOString().slice(0, 10);
  const products = new Map<string, CjProduct | null>();
  const results: StockResult[] = [];

  for (const [slug, row] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
    if (!slug.startsWith(prefix)) continue;
    const src = sourcing.get(slug);
    const base = { slug, before: row.stock, costBefore: row.unitCostCents, retail: prices[slug] ?? 0 };
    const itemId = src?.platform === "ALIEXPRESS" && src.kind === "listing" ? src.url.match(/\/item\/(\d+)\.html/)?.[1] : undefined;

    if (aeKeys && itemId) {
      const [p] = await aliexpressCall("aliexpress.affiliate.productdetail.get", { product_ids: itemId, country: "US" }).catch(() => []);
      // The affiliate API returns listed products only; a missing one has been taken down.
      const after = p ? Math.max(row.stock, 1) : 0;
      const costAfter = p?.target_sale_price ? usdToCents(p.target_sale_price) : row.unitCostCents;
      rows.set(slug, { ...row, stock: after, unitCostCents: costAfter, checkedAt: today });
      results.push({ ...base, source: "aliexpress", after, costAfter, state: p ? "in-stock" : "gone", note: p ? "" : "No longer listed on AliExpress" });
      continue;
    }

    if (cj && row.pid) {
      if (!products.has(row.pid)) {
        await pause();
        products.set(row.pid, await cj.product(row.pid).catch(() => null));
      }
      const product = products.get(row.pid);
      const variant = product?.variants?.find((v) => v.vid === row.vid);
      if (!product || String(product.status) !== ON_SALE || !variant) {
        rows.set(slug, { ...row, stock: 0, checkedAt: today });
        const note = !product ? "Product no longer on CJ" : String(product.status) !== ON_SALE ? "CJ took it off sale" : "That variant was removed";
        results.push({ ...base, source: "cj", after: 0, costAfter: row.unitCostCents, state: "gone", note });
        continue;
      }
      await pause();
      const stock = await cj
        .get<{ totalInventoryNum?: number }[]>(`/product/stock/queryByVid?vid=${encodeURIComponent(variant.vid)}`)
        .then((list) => (list ?? []).reduce((n, s) => n + (s.totalInventoryNum ?? 0), 0))
        .catch(() => null);
      if (stock === null) {
        results.push({ ...base, source: "cj", after: row.stock, costAfter: row.unitCostCents, state: "not-checked", note: "Stock check failed; left as it was" });
        continue;
      }
      const costAfter = usdToCents(variant.variantSellPrice) || row.unitCostCents;
      rows.set(slug, { ...row, stock, unitCostCents: costAfter, checkedAt: today });
      results.push({ ...base, source: "cj", after: stock, costAfter, state: stock > 0 ? "in-stock" : "out-of-stock", note: "" });
      continue;
    }

    results.push({ ...base, source: "none", after: row.stock, costAfter: row.unitCostCents, state: "not-checked", note: "No stock source for this product" });
  }

  // Report.
  const r = (pred: (x: StockResult) => boolean) => results.filter(pred);
  const unavailable = (x: StockResult) => x.state === "out-of-stock" || x.state === "gone";
  const newlyOut = r((x) => unavailable(x) && x.before > 0);
  const backIn = r((x) => x.state === "in-stock" && x.before === 0);
  const stillOut = r((x) => unavailable(x) && x.before === 0);
  const notChecked = r((x) => x.state === "not-checked");
  const priced = r((x) => x.costAfter !== x.costBefore && x.state !== "not-checked");
  const thin = results
    .filter((x) => x.state === "in-stock" && x.retail > 0)
    .map((x) => {
      const ship = rows.get(x.slug)!.shippingCostCents;
      const landed = landedCostCents({ unitCostCents: x.costAfter, shippingCostCents: ship });
      return { ...x, landed, markup: markup(x.retail, landed), floor: floorRetailCents({ unitCostCents: x.costAfter, shippingCostCents: ship }) };
    })
    .filter((x) => x.markup < MIN_MARKUP);

  const line = (x: StockResult) => `- ${x.slug}${x.note ? `: ${x.note}` : ""}`;
  const md = [
    `# Stock report, ${today}`,
    "",
    `Checked ${results.length} products: ${r((x) => x.state === "in-stock").length} in stock, ${r(unavailable).length} unavailable, ${notChecked.length} not checked.`,
    `Sources: ${aeKeys ? "AliExpress Affiliate API (exact links), " : ""}${cj ? "CJdropshipping API (read-only)" : ""}.`,
    "",
    `## Newly out of stock (${newlyOut.length})`,
    ...newlyOut.map(line),
    "",
    `## Back in stock (${backIn.length})`,
    ...backIn.map(line),
    "",
    `## Still unavailable (${stillOut.length})`,
    ...stillOut.map(line),
    "",
    `## Supplier price changes (${priced.length})`,
    ...priced.map((x) => `- ${x.slug}: ${usd(x.costBefore)} -> ${usd(x.costAfter)}`),
    "",
    `## Below the ${MIN_MARKUP}x price floor (${thin.length})`,
    "Retail under twice the landed cost (item + shipping). `--reprice` raises these to the floor.",
    ...thin.map((x) => `- ${x.slug}: retail ${usd(x.retail)}, landed ${usd(x.landed)} (${x.markup.toFixed(2)}x); floor ${usd(x.floor)}`),
    "",
    `## Not checked (${notChecked.length})`,
    ...notChecked.map(line),
    "",
  ].join("\n");
  writeFileSync(REPORT, md);
  console.log(md);

  if (!apply) {
    console.log("Report only. Run with --apply to update the site.");
    return;
  }
  const keep = { ...prices };
  if (reprice) for (const x of thin) keep[x.slug] = x.floor;
  writeFileSync(VARIANTS, variantsTsv([...rows.values()] as CjVariantRow[]));
  writeFileSync(OFFERS_FILE, offersSource([...rows.values()], { keepPrices: keep, shippingEstimate: ALIEXPRESS_DELIVERY }));
  console.log(`Updated stock for ${results.length} products${reprice ? ` and raised ${thin.length} prices to the floor` : ""}. Loading it into the database...`);
  const seed = spawnSync("npm run db:seed", { shell: true, stdio: "inherit", cwd: fileURLToPath(new URL("..", import.meta.url)) });
  if (seed.status !== 0) throw new Error("Seeding failed; the files are updated, run `npm run db:seed` after fixing it");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
