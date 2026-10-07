import type { Metadata } from "next";
import Link from "next/link";
import type { ProductCategory } from "@shared/types";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { categoryLabels, getProducts, getRoomsByProduct } from "@/services/products";
import { getStyles } from "@/services/rooms";
import { pluralize } from "@/utils/format";

export const metadata: Metadata = {
  title: "Catalogue",
  description: "Every piece from every room: lighting, wall art, rugs, desk and decor.",
};

const isCategory = (v: unknown): v is ProductCategory => typeof v === "string" && v in categoryLabels;

export default async function CataloguePage({ searchParams }: PageProps<"/catalogue">) {
  const params = await searchParams;
  const style = typeof params.style === "string" ? params.style : undefined;
  const category = isCategory(params.category) ? params.category : undefined;

  const [styles, products, roomsByProduct] = await Promise.all([
    getStyles(),
    getProducts({ style, category }),
    getRoomsByProduct(),
  ]);

  const href = (next: { style?: string; category?: string }) => {
    const q = new URLSearchParams();
    if (next.style) q.set("style", next.style);
    if (next.category) q.set("category", next.category);
    const s = q.toString();
    return s ? `/catalogue?${s}` : "/catalogue";
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-12 md:px-8 md:pt-16">
      <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">Catalogue</h1>
      <p className="mt-4 max-w-[48ch] text-lg text-muted">Every piece from every room, sold on its own.</p>

      <div className="mt-10 space-y-4">
        <FilterRow label="Style">
          <Chip href={href({ category })} active={!style}>All</Chip>
          {styles.map((s) => (
            <Chip key={s.slug} href={href({ style: s.slug, category })} active={style === s.slug}>
              {s.name}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Category">
          <Chip href={href({ style })} active={!category}>All</Chip>
          {Object.entries(categoryLabels).map(([value, label]) => (
            <Chip key={value} href={href({ style, category: value })} active={category === value}>
              {label}
            </Chip>
          ))}
        </FilterRow>
      </div>

      <p className="mt-10 text-sm text-muted">{pluralize(products.length, "piece")}</p>

      {products.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line px-6 py-20 text-center">
          <p className="font-medium">Nothing matches those filters</p>
          <p className="mt-2 text-sm text-muted">Try another style, or clear the filters.</p>
          <Link href="/catalogue" className="mt-5 inline-block text-sm font-medium underline underline-offset-4">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} roomId={roomsByProduct[p.id]?.[0]?.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="hidden w-20 shrink-0 text-sm text-muted md:block">{label}</span>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">{children}</div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
        active ? "border-fg bg-fg text-bg" : "border-line text-fg hover:border-fg/40"
      }`}
    >
      {children}
    </Link>
  );
}
