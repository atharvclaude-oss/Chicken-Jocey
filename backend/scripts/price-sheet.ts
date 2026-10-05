// Prices the sourcing sheet at the 2x floor.
//
//   npm run price-sheet                      # data/sourcing.tsv -> data/sourcing-priced.csv
//   npm run price-sheet -- in.tsv out.csv
//
// Fill in unit_cost_usd and shipping_usd (the AliExpress price and shipping to
// the US, in dollars) and re-run. Rows without a cost come out as NEEDS COST.
// Exits non-zero if the sheet has duplicate SKUs/item ids or malformed rows.

import { readFileSync, writeFileSync } from "node:fs";
import { MIN_MARKUP, floorRetailCents, grossMargin, landedCostCents } from "../src/modules/pricing/pricing.ts";

const [input = "data/sourcing.tsv", output = "data/sourcing-priced.csv"] = process.argv.slice(2);

const COLUMNS = [
  "sku",
  "product",
  "primary_aesthetic",
  "also_fits",
  "placement_slot",
  "budget_tier",
  "sourcing_status",
  "aliexpress_item_id",
  "unit_cost_usd",
  "shipping_usd",
  "note",
] as const;
type Row = Record<(typeof COLUMNS)[number], string>;

const toCents = (usd: string) => Math.round(Number(usd.replace(/[$,\s]/g, "")) * 100);
const usd = (cents: number) => (cents / 100).toFixed(2);
const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

const lines = readFileSync(input, "utf8").split(/\r?\n/).filter((l) => l.trim());
const header = lines[0]!.split("\t");
if (header.join() !== COLUMNS.join()) {
  console.error(`Unexpected header in ${input}.\nExpected: ${COLUMNS.join(", ")}`);
  process.exit(1);
}

const errors: string[] = [];
const seenSku = new Map<string, number>();
const seenItem = new Map<string, number>();
const rows: Row[] = [];

lines.slice(1).forEach((line, i) => {
  const lineNo = i + 2;
  const cells = line.split("\t");
  // Editors and Excel drop trailing empty cells; treat them as blank.
  while (cells.length < COLUMNS.length) cells.push("");
  if (cells.length > COLUMNS.length) {
    errors.push(`line ${lineNo}: expected ${COLUMNS.length} columns, got ${cells.length}`);
    return;
  }
  const row = Object.fromEntries(COLUMNS.map((c, j) => [c, cells[j]!.trim()])) as Row;

  if (seenSku.has(row.sku)) errors.push(`line ${lineNo}: SKU ${row.sku} already used on line ${seenSku.get(row.sku)}`);
  seenSku.set(row.sku, lineNo);
  if (!/^\d{8,20}$/.test(row.aliexpress_item_id)) {
    errors.push(`line ${lineNo}: ${row.sku} item id "${row.aliexpress_item_id}" is not a plain number (Excel E+ notation?)`);
  } else if (seenItem.has(row.aliexpress_item_id)) {
    errors.push(`line ${lineNo}: ${row.sku} is the same listing as line ${seenItem.get(row.aliexpress_item_id)}`);
  }
  seenItem.set(row.aliexpress_item_id, lineNo);
  for (const col of ["unit_cost_usd", "shipping_usd"] as const) {
    if (row[col] && !(toCents(row[col]) >= 0)) errors.push(`line ${lineNo}: ${row.sku} ${col} "${row[col]}" is not a number`);
  }
  rows.push(row);
});

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const out = [[...COLUMNS, "aliexpress_url", "landed_usd", "retail_usd", "markup", "margin", "price_status"]];
let priced = 0;
for (const row of rows) {
  const url = `https://www.aliexpress.us/item/${row.aliexpress_item_id}.html`;
  let extra: (string | number)[] = [url, "", "", "", "", "NEEDS COST"];
  if (row.unit_cost_usd) {
    // Blank shipping means free shipping.
    const costs = { unitCostCents: toCents(row.unit_cost_usd), shippingCostCents: toCents(row.shipping_usd || "0") };
    const landed = landedCostCents(costs);
    const retail = floorRetailCents(costs);
    extra = [
      url,
      usd(landed),
      usd(retail),
      landed ? `${(retail / landed).toFixed(2)}x` : "",
      `${Math.round(grossMargin(retail, landed) * 100)}%`,
      "PRICED",
    ];
    priced++;
  }
  out.push([...COLUMNS.map((c) => row[c]), ...extra.map(String)]);
}

// BOM so Excel opens it as UTF-8.
writeFileSync(output, "﻿" + out.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n");
console.log(
  `${rows.length} products, ${priced} priced at >= ${MIN_MARKUP}x landed cost, ${rows.length - priced} need a cost. Wrote ${output}`,
);
