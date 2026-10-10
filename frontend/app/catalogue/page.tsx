import type { Metadata } from "next";
import { CatalogueTile } from "@/components/catalogue/CatalogueTile";
import { getDepartments } from "@/services/products";

export const metadata: Metadata = {
  title: "Catalogue",
  description: "Shop by department: lamps for every room and mood.",
};

// Lamps is the only department today; the rest of the grid holds space for what's coming.
const GRID_SLOTS = 6;

export default async function CataloguePage() {
  const departments = await getDepartments();
  const fillers = Math.max(GRID_SLOTS - departments.length, 0);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-12 md:px-8 md:pt-16">
      <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">Catalogue</h1>
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
