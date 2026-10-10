import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/ssr";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { getProductsByIds } from "@/services/products";
import { getScenes, scenes } from "@/services/scenes";
import { formatPrice, pluralize } from "@/utils/format";
import { roomHref } from "@/utils/routes";

export function generateStaticParams() {
  return scenes.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/rooms/[id]">): Promise<Metadata> {
  const { id } = await params;
  const room = scenes.find((s) => s.id === id);
  if (!room) return {};
  return {
    title: `${room.name}: featured catalogue`,
    description: `Every piece in ${room.name}, the 3D room. Click any of them in the room, or buy them here.`,
  };
}

/** Featured Catalogue: everything placed in one room, in one grid. */
export default async function FeaturedCataloguePage({ params }: PageProps<"/rooms/[id]">) {
  const { id } = await params;
  const room = (await getScenes()).find((s) => s.id === id);
  if (!room) notFound();
  const products = await getProductsByIds(room.productIds);
  const buyable = products.filter((p) => !p.comingSoon && p.available);
  const roomTotal = buyable.reduce((sum, p) => sum + p.priceCents, 0);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 md:px-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={16} /> All rooms
      </Link>

      <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-balance text-4xl font-semibold tracking-[-0.035em] md:text-6xl">{room.name}</h1>
          <p className="mt-3 max-w-[52ch] text-lg text-muted">
            The featured catalogue: every piece in this room, each one the exact item you can click inside it.
          </p>
        </div>
        <Link
          href={roomHref(room.id)}
          className="group inline-flex h-12 shrink-0 items-center gap-2 self-start rounded-full bg-fg px-6 text-[15px] font-medium text-bg transition-transform duration-200 ease-out hover:scale-[1.03] active:scale-[0.98] md:self-auto"
        >
          Walk through the room
          <ArrowRight size={16} className="transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
        </Link>
      </div>

      <p className="mt-10 text-sm text-muted">
        {pluralize(products.length, "piece")}
        {buyable.length > 0 && (
          <>
            {" "}
            · {buyable.length} available now, <span className="font-mono tabular-nums text-fg">{formatPrice(roomTotal)}</span> for all of them
          </>
        )}
        {buyable.length < products.length && <> · {products.length - buyable.length} being sourced</>}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} roomId={room.id} />
        ))}
      </div>
    </div>
  );
}
