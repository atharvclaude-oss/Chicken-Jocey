import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Truck } from "@phosphor-icons/react/ssr";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { RoomCard } from "@/components/room/RoomCard";
import { categoryLabels, getProduct, getProducts, styleName } from "@/services/products";
import { getRoomsContainingProduct } from "@/services/rooms";
import { formatPrice } from "@/utils/format";

export async function generateStaticParams() {
  const products = await getProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
    openGraph: { images: [product.image] },
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();
  const rooms = await getRoomsContainingProduct(product.id);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 md:px-8">
      <Link href="/catalogue" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={16} /> Catalogue
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-sunken lg:aspect-[5/6]">
          <Image src={product.image} alt={product.name} fill preload sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start lg:pt-4">
          <p className="text-sm text-muted">
            {styleName(product.styles[0])} · {categoryLabels[product.category]}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tighter md:text-5xl">{product.name}</h1>
          <p className="mt-4 font-mono text-2xl tabular-nums">{formatPrice(product.priceCents)}</p>

          <p className="mt-6 max-w-[48ch] leading-relaxed text-muted">{product.description}</p>

          <dl className="mt-8 grid grid-cols-[120px_1fr] gap-y-3 border-t border-line pt-6 text-sm">
            <dt className="text-muted">Color</dt>
            <dd>{product.color}</dd>
            <dt className="text-muted">Dimensions</dt>
            <dd>{product.dimensions}</dd>
            <dt className="text-muted">Shipping</dt>
            <dd className="inline-flex items-center gap-2">
              <Truck size={16} className="text-muted" />
              {product.available ? product.shippingEstimate : "Currently unavailable"}
            </dd>
          </dl>

          <AddToCartButton product={product} source="catalogue" className="mt-8 w-full sm:w-auto sm:min-w-[220px]" />
        </div>
      </div>

      {rooms.length > 0 && (
        <section id="in-rooms" className="scroll-mt-24 pt-24">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">See how this looks in a room</h2>
          <p className="mt-3 text-muted">
            {product.name} appears in {rooms.length === 1 ? "this room" : `these ${rooms.length} rooms`}.
          </p>
          <div className="mt-10 grid gap-x-6 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
