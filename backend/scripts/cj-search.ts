// Finds CJdropshipping candidates for every product in the 3D rooms.
//
//   npm run cj:search                 every product without a CJ listing yet
//   npm run cj:search -- neo-         only products whose id starts with "neo-" (or any prefix)
//   npm run cj:search -- a,b,c        only these product ids
//   npm run cj:search -- --refresh    search again even for products already listed
//
// For each product it searches CJ with the keywords in data/cj-search.json, then
// pulls full details (exact variants, prices, stock, images) for the top
// matches. Results go to data/cj-candidates/<product>.json plus a visual review
// page, data/cj-candidates/index.html. Add the exact match to
// data/product-sourcing.tsv as a CJDROPSHIPPING listing (its CJ product URL, and
// the variant name exactly as CJ shows it in `option`), then
// `npm run fetch-cj -- <product id> --apply` imports cost, stock, photo and price.
//
// Needs CJ_API_KEY in backend/.env. CJ allows 1 request per second, so a full
// run (~50 products) takes several minutes.

import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CjClient, cjStock, type CjProduct } from "../src/modules/suppliers/cj.ts";
import { DATA_DIR, loadProductSourcing } from "../src/modules/sourcing/sourcing-sheet.ts";

const CATALOG = fileURLToPath(new URL("../../frontend/services/room-catalog.json", import.meta.url));
const OUT = `${DATA_DIR}cj-candidates/`;
const DETAILS_PER_PRODUCT = 8;

interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  color: string;
  description: string;
}

export interface Candidate {
  pid: string;
  name: string;
  image: string;
  url: string;
  variants: { vid: string; key: string; priceUsd: number; image: string; stock: number; sizeMm: string }[];
}

export const cjProductUrl = (pid: string) => `https://cjdropshipping.com/product/-p-${pid}.html`;

export function toCandidate(p: CjProduct): Candidate {
  return {
    pid: p.pid,
    name: p.productNameEn,
    image: p.bigImage,
    url: cjProductUrl(p.pid),
    variants: (p.variants ?? []).map((v) => {
      return {
        vid: v.vid,
        key: v.variantKey || v.variantNameEn || "",
        priceUsd: Number(v.variantSellPrice),
        image: v.variantImage || p.bigImage,
        stock: cjStock(v),
        sizeMm: [v.variantLength, v.variantWidth, v.variantHeight].every(Boolean)
          ? `${v.variantLength}x${v.variantWidth}x${v.variantHeight}`
          : "",
      };
    }),
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A review page: for each product, its room description next to every CJ candidate. */
function writeReviewPage(products: CatalogProduct[]) {
  const sections = products
    .filter((p) => existsSync(`${OUT}${p.id}.json`))
    .map((p) => {
      const cands = JSON.parse(readFileSync(`${OUT}${p.id}.json`, "utf8")) as Candidate[];
      const cards = cands
        .map(
          (c, i) => `<figure><img src="${esc(c.image)}" loading="lazy"><figcaption><b>${i + 1}.</b> ${esc(c.name)}<br>
            <small>pid ${esc(c.pid)} · ${c.variants.length} variants · from $${Math.min(...c.variants.map((v) => v.priceUsd)).toFixed(2)}</small></figcaption></figure>`,
        )
        .join("");
      return `<section><h2>${esc(p.name)} <small>${esc(p.id)}</small></h2><p>${esc(p.color)}. ${esc(p.description)}</p><div class="grid">${cards || "<p>No results</p>"}</div></section>`;
    })
    .join("");
  writeFileSync(
    `${OUT}index.html`,
    `<!doctype html><meta charset="utf-8"><title>CJ candidates</title><style>
body{font:14px system-ui;background:#111;color:#eee;margin:24px}section{margin-bottom:36px}h2 small{color:#888;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}figure{margin:0;background:#1c1c1e;border-radius:8px;overflow:hidden}
img{width:100%;aspect-ratio:1;object-fit:cover;background:#fff}figcaption{padding:6px 8px;font-size:12px;line-height:1.35}small{color:#999}
</style>${sections}`,
  );
}

async function main() {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new Error("Set CJ_API_KEY in backend/.env (CJ dashboard > Authorization > API).");
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const prefix = args.find((a) => !a.startsWith("--")) ?? "";

  // One prefix ("neo-") or a comma-separated list of exact product ids.
  const ids = prefix.includes(",") ? new Set(prefix.split(",")) : null;
  const products = (JSON.parse(readFileSync(CATALOG, "utf8")).products as CatalogProduct[]).filter((p) =>
    ids ? ids.has(p.id) : p.id.startsWith(prefix),
  );
  const keywords = JSON.parse(readFileSync(`${DATA_DIR}cj-search.json`, "utf8")) as Record<string, string>;
  const listed = new Set(loadProductSourcing().filter((s) => s.platform === "CJDROPSHIPPING" && s.kind === "listing").map((s) => s.productSlug));
  const todo = products.filter((p) => refresh || !listed.has(p.id));

  mkdirSync(OUT, { recursive: true });
  const cj = new CjClient(apiKey);
  console.log(`Searching CJ for ${todo.length} products (${products.length - todo.length} already listed)...`);

  for (const [i, p] of todo.entries()) {
    const query = keywords[p.id] ?? p.name;
    try {
      const hits = await cj.searchProducts(query, 10);
      const candidates: Candidate[] = [];
      for (const hit of hits.slice(0, DETAILS_PER_PRODUCT)) {
        candidates.push(toCandidate(await cj.product(hit.id)));
      }
      writeFileSync(`${OUT}${p.id}.json`, JSON.stringify(candidates, null, 2));
      console.log(`[${i + 1}/${todo.length}] ${p.id}: ${candidates.length} candidates for "${query}"`);
    } catch (err) {
      console.error(`[${i + 1}/${todo.length}] ${p.id}: ${(err as Error).message}`);
    }
  }
  writeReviewPage(products);
  console.log(`\nReview: ${OUT}index.html\nThen add picks to data/product-sourcing.tsv and run npm run fetch-cj -- <id> --apply.`);
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/cj-search.ts");
if (isMain) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  });
}
