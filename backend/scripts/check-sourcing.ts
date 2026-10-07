// Checks that every shoppable object in the generated 3D rooms routes to a
// catalogue product and a supplier listing.
//
//   npm run check-sourcing
//
// A room object is shoppable when it has a `productId` (3d-engine/rooms/*.json,
// exported into the .glb as glTF extras). Its 3D model may come from the asset
// library (Poly Haven) or be modelled in code: either way, the product we sell
// is fulfilled from the listing in data/product-sourcing.tsv, never from the
// model. Exits non-zero on broken links; search-only products are warnings
// (shoppable on the site, but someone must pick an exact listing before launch).

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { products } from "../../frontend/services/mock-data.ts";
import { scenes } from "../../frontend/services/scenes.ts";
import { loadProductSourcing } from "../src/modules/sourcing/sourcing-sheet.ts";

const ROOMS_DIR = fileURLToPath(new URL("../../3d-engine/rooms/", import.meta.url));

interface SpecObject {
  asset: string;
  productId?: string;
}

const errors: string[] = [];
const warnings: string[] = [];

let sourcing;
try {
  sourcing = new Map(loadProductSourcing().map((s) => [s.productSlug, s]));
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const catalogue = new Map(products.map((p) => [p.id, p]));

// Room id -> product ids, from the room specs and the frontend scene list.
const rooms = new Map<string, { productId: string; asset: string }[]>();
for (const file of readdirSync(ROOMS_DIR).filter((f) => f.endsWith(".json"))) {
  const spec = JSON.parse(readFileSync(ROOMS_DIR + file, "utf8")) as { id: string; objects: SpecObject[] };
  rooms.set(
    spec.id,
    spec.objects.filter((o) => o.productId).map((o) => ({ productId: o.productId!, asset: o.asset })),
  );
}
for (const scene of scenes) {
  const spec = rooms.get(scene.id);
  if (!spec) {
    errors.push(`${scene.id}: in frontend/services/scenes.ts but has no 3d-engine/rooms/${scene.id}.json`);
    continue;
  }
  const tagged = new Set(spec.map((o) => o.productId));
  for (const id of scene.productIds) {
    if (!tagged.has(id)) errors.push(`${scene.id}: scenes.ts lists ${id}, but no object in the room spec is tagged with it`);
  }
  for (const id of tagged) {
    if (!scene.productIds.includes(id)) errors.push(`${scene.id}: room spec tags ${id}, but scenes.ts doesn't list it (it won't be clickable)`);
  }
}

const rows: string[][] = [];
for (const [roomId, objects] of rooms) {
  for (const { productId, asset } of objects) {
    const product = catalogue.get(productId);
    const source = sourcing.get(productId);
    if (!product) errors.push(`${roomId}: ${asset} is tagged ${productId}, which is not a catalogue product`);
    if (!source) {
      errors.push(`${roomId}: ${productId} has no row in backend/data/product-sourcing.tsv`);
    } else if (source.kind === "search") {
      warnings.push(`${productId}: search link only, pick an exact ${source.platform} listing`);
    } else if (!source.sku) {
      warnings.push(`${productId}: listing not in sourcing.tsv yet, so it has no cost or retail check`);
    } else if (source.unitCostCents === null) {
      warnings.push(`${productId}: ${source.sku} has no unit cost in sourcing.tsv`);
    }
    rows.push([roomId, productId, asset, source ? `${source.platform} ${source.kind}` : "MISSING", source?.url ?? ""]);
  }
}

const width = (i: number) => Math.max(...rows.map((r) => r[i]!.length));
for (const r of rows) console.log(r.map((c, i) => (i < 4 ? c.padEnd(width(i)) : c)).join("  "));
console.log();
for (const w of new Set(warnings)) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
const listings = [...sourcing.values()].filter((s) => s.kind === "listing").length;
console.log(`\n${rows.length} shoppable objects in ${rooms.size} rooms; ${listings}/${sourcing.size} products have an exact listing.`);
if (errors.length) process.exit(1);
