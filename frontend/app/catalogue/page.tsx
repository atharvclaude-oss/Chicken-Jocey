import type { Metadata } from "next";
import Link from "next/link";
import { CatalogueTile } from "@/components/catalogue/CatalogueTile";
import { getDepartments } from "@/services/products";
import { getScenes } from "@/services/scenes";
import { featuredCatalogueHref } from "@/utils/routes";

export const metadata: Metadata = {
  title: "Catalogue",
  description: "Shop by department (lighting, seating, tables, storage, decor, textiles, bedroom, technology) or everything in one of the 3D rooms.",
};


export default async function CataloguePage() {
  const [departments, rooms] = await Promise.all([getDepartments(), getScenes()]);
  // Two boxes per row: an empty filler keeps the last row even.
  const fillers = departments.length % 2;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-12 md:px-8 md:pt-16">
      <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">Catalogue</h1>

      {/* Every room's featured catalogue: each piece is the exact item you can click in that room. */}
      <nav aria-label="Featured catalogues" className="mt-8">
        <h2 className="text-sm text-muted">Shop a room</h2>
        <ul className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {rooms.map((r) => (
            <li key={r.id} className="shrink-0">
              <Link
                href={featuredCatalogueHref(r.id)}
                className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm transition-colors hover:border-fg/40"
              >
                {r.name}
                <span className="font-mono text-xs tabular-nums text-muted">{r.productIds.length}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:mt-12 lg:gap-6">
        {departments.map((d, i) => (
          <CatalogueTile key={d.slug} href={`/catalogue/${d.slug}`} image={d.image} label={d.name} preload={i === 0} />
        ))}
        {Array.from({ length: fillers }, (_, i) => (
          <CatalogueTile key={`filler-${i}`} />
        ))}
      </div>
    </div>
  );
}
