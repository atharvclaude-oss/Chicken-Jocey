// Product -> supplier routing, read from the sourcing data files.
//
//   data/product-sourcing.tsv   which supplier listing fulfils each product (one row per product)
//   data/sourcing.tsv           the priced AliExpress sheet; `sku` rows above pull item id and cost from here
//
// Pure parsing lives here so the seed, the check script and tests share it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type SourcingPlatform = "ALIEXPRESS" | "ALIBABA" | "DISTRIBUTOR" | "OTHER";

/**
 * `listing` is an exact product page we can order from. `search` is a curated
 * search link: someone still has to pick the listing, so the product cannot be
 * fulfilled yet.
 */
export type SourcingKind = "listing" | "search";

export interface ProductSourcing {
  productSlug: string;
  platform: SourcingPlatform;
  kind: SourcingKind;
  /** Our sheet SKU in data/sourcing.tsv, when the listing is priced there. */
  sku: string | null;
  url: string;
  /** Supplier's id for the exact item + option, e.g. "3256808049031703:50x70". Null for searches. */
  supplierSku: string | null;
  /** Option to choose on the listing (size, colour). */
  option: string;
  /** Null until someone fills the cost in data/sourcing.tsv. */
  unitCostCents: number | null;
  shippingCostCents: number | null;
  notes: string;
}

const PRODUCT_COLUMNS = ["product_slug", "platform", "kind", "sku", "url", "option", "notes"] as const;
const PLATFORMS: SourcingPlatform[] = ["ALIEXPRESS", "ALIBABA", "DISTRIBUTOR", "OTHER"];

export const DATA_DIR = fileURLToPath(new URL("../../../data/", import.meta.url));

function parseTsv(text: string): { header: string[]; rows: { lineNo: number; cells: string[] }[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = lines[0]!.split("\t").map((h) => h.trim());
  const rows = lines
    .map((line, i) => ({ lineNo: i + 1, cells: line.split("\t").map((c) => c.trim()) }))
    .slice(1)
    .filter((r) => r.cells.some(Boolean) && !r.cells[0]!.startsWith("#"));
  return { header, rows };
}

const toCents = (usd: string) => (usd ? Math.round(Number(usd.replace(/[$,\s]/g, "")) * 100) : null);

interface SheetRow {
  itemId: string;
  unitCostCents: number | null;
  shippingCostCents: number | null;
}

/** data/sourcing.tsv keyed by SKU. Validation of the sheet itself lives in scripts/price-sheet.ts. */
export function parsePriceSheet(text: string): Map<string, SheetRow> {
  const { header, rows } = parseTsv(text);
  const col = (name: string) => header.indexOf(name);
  const [sku, item, cost, ship] = ["sku", "aliexpress_item_id", "unit_cost_usd", "shipping_usd"].map(col);
  if ([sku, item, cost, ship].some((i) => i === -1)) throw new Error("sourcing.tsv: unexpected header");
  const sheet = new Map<string, SheetRow>();
  for (const { cells } of rows) {
    const unit = toCents(cells[cost!] ?? "");
    sheet.set(cells[sku!]!, {
      itemId: cells[item!] ?? "",
      unitCostCents: unit,
      // Blank shipping means free shipping, but only once the item cost is known.
      shippingCostCents: unit === null ? null : (toCents(cells[ship!] ?? "") ?? 0),
    });
  }
  return sheet;
}

const itemIdFromUrl = (url: string) =>
  url.match(/aliexpress\.[a-z.]+\/(?:item|i)\/(\d+)\.html/)?.[1] ??
  url.match(/alibaba\.com\/product-detail\/[^?]*?_(\d+)\.html/)?.[1] ??
  null;

/**
 * Resolves data/product-sourcing.tsv against the price sheet. Throws with every
 * problem listed, so a bad edit fails the seed instead of shipping wrong links.
 */
export function parseProductSourcing(text: string, sheet: Map<string, SheetRow>): ProductSourcing[] {
  const { header, rows } = parseTsv(text);
  if (header.join() !== PRODUCT_COLUMNS.join()) {
    throw new Error(`product-sourcing.tsv: expected columns ${PRODUCT_COLUMNS.join(", ")}`);
  }
  const errors: string[] = [];
  const seen = new Set<string>();
  const out: ProductSourcing[] = [];

  for (const { lineNo, cells } of rows) {
    while (cells.length < PRODUCT_COLUMNS.length) cells.push("");
    const [productSlug, platformRaw, kindRaw, skuRaw, urlRaw, option, notes] = cells as string[];
    const at = `product-sourcing.tsv line ${lineNo} (${productSlug})`;

    if (seen.has(productSlug!)) errors.push(`${at}: product listed twice`);
    seen.add(productSlug!);
    const platform = platformRaw as SourcingPlatform;
    if (!PLATFORMS.includes(platform)) errors.push(`${at}: platform must be one of ${PLATFORMS.join(", ")}`);
    if (kindRaw !== "listing" && kindRaw !== "search") errors.push(`${at}: kind must be "listing" or "search"`);
    const kind = kindRaw as SourcingKind;

    let url = urlRaw!;
    let unitCostCents: number | null = null;
    let shippingCostCents: number | null = null;
    const sku = skuRaw || null;
    if (sku) {
      const row = sheet.get(sku);
      if (!row) {
        errors.push(`${at}: SKU ${sku} is not in sourcing.tsv`);
      } else {
        url ||= `https://www.aliexpress.us/item/${row.itemId}.html`;
        unitCostCents = row.unitCostCents;
        shippingCostCents = row.shippingCostCents;
      }
    }
    if (!/^https:\/\/([a-z0-9-]+\.)*(aliexpress\.(com|us)|alibaba\.com)\//.test(url) && platform !== "DISTRIBUTOR" && platform !== "OTHER") {
      errors.push(`${at}: url must be an https AliExpress/Alibaba link, got "${url}"`);
    }

    let supplierSku: string | null = null;
    if (kind === "listing") {
      const itemId = itemIdFromUrl(url);
      if (!itemId) errors.push(`${at}: a listing needs an item page URL (…/item/<id>.html), got "${url}"`);
      supplierSku = itemId && (option ? `${itemId}:${option}` : itemId);
    }

    out.push({ productSlug: productSlug!, platform, kind, sku, url, supplierSku, option: option!, unitCostCents, shippingCostCents, notes: notes! });
  }

  if (errors.length) throw new Error(errors.join("\n"));
  return out;
}

/** Reads and resolves the data files from backend/data. */
export function loadProductSourcing(dir = DATA_DIR): ProductSourcing[] {
  const sheet = parsePriceSheet(readFileSync(`${dir}sourcing.tsv`, "utf8"));
  return parseProductSourcing(readFileSync(`${dir}product-sourcing.tsv`, "utf8"), sheet);
}
