// Pulls official product data and photos from the AliExpress Affiliate API (no scraping).
//
//   npm run fetch-aliexpress -- <slug-prefix>            dry run: show what each product resolves to
//   npm run fetch-aliexpress -- <slug-prefix> --apply    also save photos and record picked listings
//
// e.g. `npm run fetch-aliexpress -- neo-` for the Colonial Parlour.
//
// For each AliExpress row in data/product-sourcing.tsv whose slug starts with the prefix:
//   - `listing` rows: looks the item up by id (aliexpress.affiliate.productdetail.get)
//   - `search` rows:  searches the row's keywords (aliexpress.affiliate.product.query) and takes
//                     the best-selling match; --apply records it as a listing, flagged "verify"
// With --apply the product's main photo is saved as frontend/public/images/products/<slug>.jpg,
// which is the image the catalogue already shows. Alibaba rows are skipped (no affiliate API).
//
// Needs, in backend/.env (free at https://portals.aliexpress.com, Affiliate > API):
//   ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID

import "dotenv/config";
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DATA_DIR } from "../src/modules/sourcing/sourcing-sheet.ts";

const GATEWAY = "https://api-sg.aliexpress.com/sync";
const IMAGES_DIR = fileURLToPath(new URL("../../frontend/public/images/products/", import.meta.url));
const SOURCING = `${DATA_DIR}product-sourcing.tsv`;

export interface AeProduct {
  product_id: number | string;
  product_title: string;
  product_main_image_url: string;
  product_detail_url: string;
  target_sale_price?: string;
  lastest_volume?: number;
}

/** IOP request signature: HMAC-SHA256 over the sorted key+value pairs, upper-case hex. */
export function sign(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join("");
  return createHmac("sha256", secret).update(base, "utf8").digest("hex").toUpperCase();
}

export async function call(method: string, args: Record<string, string>): Promise<AeProduct[]> {
  const key = process.env.ALIEXPRESS_APP_KEY;
  const secret = process.env.ALIEXPRESS_APP_SECRET;
  if (!key || !secret) throw new Error("Set ALIEXPRESS_APP_KEY and ALIEXPRESS_APP_SECRET in backend/.env");
  const params: Record<string, string> = {
    method,
    app_key: key,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    target_currency: "USD",
    target_language: "EN",
    tracking_id: process.env.ALIEXPRESS_TRACKING_ID ?? "",
    ...args,
  };
  params.sign = sign(params, secret);
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if ("error_response" in body) throw new Error(`${method}: ${JSON.stringify(body.error_response)}`);
  const root = body[`${method.replaceAll(".", "_")}_response`] as
    | { resp_result?: { resp_code?: number; resp_msg?: string; result?: { products?: { product?: AeProduct[] } } } }
    | undefined;
  const result = root?.resp_result;
  if (result?.resp_code !== undefined && result.resp_code !== 200) throw new Error(`${method}: ${result.resp_msg}`);
  return result?.result?.products?.product ?? [];
}

const itemId = (url: string) => url.match(/\/(?:item|i)\/(\d+)\.html/)?.[1] ?? null;

/** "…/w/wholesale-tiffany-table-lamp-rose.html" -> "tiffany table lamp rose" */
export function keywordsFrom(url: string): string | null {
  const w = url.match(/\/w\/wholesale-([^/.]+)\.html/)?.[1];
  if (w) return decodeURIComponent(w).replace(/[-+]/g, " ").trim();
  const q = new URL(url).searchParams.get("SearchText");
  return q ? q.replace(/\+/g, " ").trim() : null;
}

async function main() {
  const [prefix, ...flags] = process.argv.slice(2);
  if (!prefix) throw new Error("usage: npm run fetch-aliexpress -- <slug-prefix> [--apply]");
  const apply = flags.includes("--apply");

  const lines = readFileSync(SOURCING, "utf-8").replace(/\r/g, "").split("\n");
  const header = lines[0]!.split("\t");
  const col = (name: string) => header.indexOf(name);

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split("\t");
    const [slug, platform, kind, url] = [cells[col("product_slug")]!, cells[col("platform")], cells[col("kind")], cells[col("url")]!];
    if (!slug?.startsWith(prefix)) continue;
    if (platform !== "ALIEXPRESS") {
      console.log(`skip    ${slug}: ${platform} has no affiliate API, pick by hand`);
      continue;
    }

    let product: AeProduct | undefined;
    if (kind === "listing" && itemId(url)) {
      [product] = await call("aliexpress.affiliate.productdetail.get", { product_ids: itemId(url)!, country: "US" });
    } else {
      const keywords = keywordsFrom(url);
      if (!keywords) {
        console.log(`skip    ${slug}: can't read search keywords from ${url}`);
        continue;
      }
      [product] = await call("aliexpress.affiliate.product.query", {
        keywords,
        sort: "LAST_VOLUME_DESC",
        ship_to_country: "US",
        page_size: "5",
      });
    }
    if (!product) {
      console.log(`none    ${slug}: no product found`);
      continue;
    }
    console.log(`found   ${slug}: ${product.product_title.slice(0, 70)} ($${product.target_sale_price ?? "?"})`);

    if (!apply) continue;
    const image = await fetch(product.product_main_image_url);
    if (!image.ok) throw new Error(`${slug}: photo download failed (${image.status})`);
    writeFileSync(`${IMAGES_DIR}${slug}.jpg`, Buffer.from(await image.arrayBuffer()));
    if (kind === "search") {
      cells[col("kind")] = "listing";
      cells[col("url")] = `https://www.aliexpress.us/item/${product.product_id}.html`;
      cells[col("notes")] = `Auto-picked best seller via Affiliate API: "${product.product_title.slice(0, 80)}". Verify it matches the room before selling. ${cells[col("notes")]}`;
      lines[i] = cells.join("\t");
    }
    console.log(`saved   ${slug}: photo -> images/products/${slug}.jpg`);
  }
  if (apply) writeFileSync(SOURCING, lines.join("\n"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
