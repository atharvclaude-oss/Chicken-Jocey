// Checks that every object in every 3D room is shoppable: it maps to a
// catalogue product, and that product routes to an exact supplier listing.
//
//   npm run check-sourcing
//
// Objects map to products in frontend/services/room-catalog.json (glTF root
// node name -> product id). This reads each room's .glb to confirm every mapped
// node exists and that no furniture or decor object is left unmapped (i.e.
// unclickable). The product we sell is fulfilled from its listing in
// data/cj-listings.tsv (or data/product-sourcing.tsv), never from the 3D model.
// Exits non-zero on broken links. Products without a listing yet are warnings:
// they show as "coming soon" on the site until `npm run cj:apply` links them.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { products } from "../../frontend/services/mock-data.ts";
import { scenes } from "../../frontend/services/scenes.ts";
import { loadProductSourcing } from "../src/modules/sourcing/sourcing-sheet.ts";

const PUBLIC = fileURLToPath(new URL("../../frontend/public/", import.meta.url));
/** Room shell and fixtures that aren't products (walls, floor, doors, window frames). */
const SHELL = /^(wall_|baseboard_|ceiling$|ceiling_\d|floor|door_|window_(?!.*_blind)|accent|light$|Camera|Sun)/;

/** Root node names of a .glb's default scene. */
export function glbRootNames(file: string): string[] {
  const buf = readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8")) as {
    nodes: { name?: string }[];
    scenes: { nodes: number[] }[];
    scene?: number;
  };
  return gltf.scenes[gltf.scene ?? 0]!.nodes.map((i) => gltf.nodes[i]?.name ?? "");
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

const rows: string[][] = [];
let objects = 0;
for (const scene of scenes) {
  if (scene.splat) continue;
  const items = scene.items ?? {};
  const roots = glbRootNames(PUBLIC + scene.model.replace(/^\//, "").replace(/\?.*$/, ""));
  const covered = (root: string) => Object.keys(items).some((k) => root === k || root.startsWith(`${k}_`));

  for (const node of Object.keys(items)) {
    if (!roots.some((r) => r === node || r.startsWith(`${node}_`))) {
      errors.push(`${scene.id}: room-catalog.json maps "${node}", but the model has no such object`);
    }
  }
  for (const root of roots) {
    if (!SHELL.test(root) && !covered(root)) errors.push(`${scene.id}: "${root}" in the model isn't mapped to a product (it won't be clickable)`);
  }

  for (const [node, productId] of Object.entries(items)) {
    objects++;
    const product = catalogue.get(productId);
    const source = sourcing.get(productId);
    if (!product) errors.push(`${scene.id}: ${node} maps to ${productId}, which is not a catalogue product`);
    if (!source) {
      warnings.push(`${productId}: no supplier listing yet (coming soon). Run npm run cj:search, pick, npm run cj:apply`);
    } else if (source.kind === "search") {
      warnings.push(`${productId}: search link only, pick an exact ${source.platform} listing`);
    } else if (source.unitCostCents === null) {
      warnings.push(`${productId}: listing has no unit cost yet`);
    } else if (source.stock === 0) {
      warnings.push(`${productId}: CJ listing was out of stock when last checked`);
    }
    rows.push([scene.id, node, productId, source ? `${source.platform} ${source.kind}` : "coming soon", source?.url ?? ""]);
  }
}

const width = (i: number) => Math.max(...rows.map((r) => r[i]!.length));
for (const r of rows) console.log(r.map((c, i) => (i < 4 ? c.padEnd(width(i)) : c)).join("  "));
console.log();
for (const w of new Set(warnings)) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
const roomProducts = new Set(rows.map((r) => r[2]!));
const listed = [...roomProducts].filter((id) => sourcing.get(id)?.kind === "listing").length;
console.log(`\n${objects} shoppable objects in ${scenes.filter((s) => !s.splat).length} rooms; ${listed}/${roomProducts.size} products have an exact listing.`);
if (errors.length) process.exit(1);
