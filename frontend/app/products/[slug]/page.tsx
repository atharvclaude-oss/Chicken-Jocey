import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Cube, Truck } from "@phosphor-icons/react/ssr";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { ProductImage } from "@/components/catalogue/ProductImage";
import { categoryLabels, getProduct, getProductHome, getProducts, getRoomsByProduct, styleName } from "@/services/products";
import { formatPrice } from "@/utils/format";
import { roomHref } from "@/utils/routes";

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
    openGraph: product.image ? { images: [product.image] } : undefined,
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();
  const rooms = (await getRoomsByProduct())[product.id] ?? [];
  const home = await getProductHome(product.id);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 md:px-8">
      <Link
        href={home ? `/catalogue/${home.department}/${home.collection}` : "/catalogue"}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft size={16} /> {home ? home.name : "Catalogue"}
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-sunken lg:aspect-[5/6]">
          <ProductImage product={product} preload sizes="(min-width: 1024px) 55vw, 100vw" />
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start lg:pt-4">
          <p className="text-sm text-muted">
            {[home?.name ?? (product.styles[0] && styleName(product.styles[0])), categoryLabels[product.category]]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tighter md:text-5xl">{product.name}</h1>
          <p className="mt-4 font-mono text-2xl tabular-nums">
            {product.comingSoon ? "Coming soon" : product.priceCents > 0 ? formatPrice(product.priceCents) : "Price coming soon"}
          </p>

          <p className="mt-6 max-w-[48ch] leading-relaxed text-muted">{product.description}</p>

          <dl className="mt-8 grid grid-cols-[120px_1fr] gap-y-3 border-t border-line pt-6 text-sm">
            {product.color && (
              <>
                <dt className="text-muted">Color</dt>
                <dd>{product.color}</dd>
              </>
            )}
            {product.dimensions && (
              <>
                <dt className="text-muted">Dimensions</dt>
                <dd>{product.dimensions}</dd>
              </>
            )}
            <dt className="text-muted">Shipping</dt>
            <dd className="inline-flex items-center gap-2">
              <Truck size={16} className="text-muted" />
              {product.comingSoon ? "Being sourced" : product.available ? product.shippingEstimate : "Currently unavailable"}
            </dd>
          </dl>

          {product.comingSoon ? (
            <p className="mt-8 max-w-[48ch] rounded-control bg-sunken px-4 py-3 text-sm text-muted">
              Being sourced. You&apos;ll be able to buy this exact piece soon.
            </p>
          ) : (
            <AddToCartButton product={product} source="catalogue" className="mt-8 w-full sm:w-auto sm:min-w-[320px]" />
          )}
        </div>
      </div>

      {rooms.length > 0 && (
        <section id="in-rooms" className="mt-20 scroll-mt-24 border-t border-line pt-10">
          <h2 className="text-2xl font-semibold tracking-tight">See it in a room</h2>
          <p className="mt-2 text-muted">Walk around it in 3D, next to the pieces it was styled with.</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link
                  href={roomHref(room.id, product.id)}
                  className="group flex items-center justify-between gap-4 rounded-card border border-line bg-surface px-5 py-4 transition-colors hover:border-fg/40"
                >
                  <span className="inline-flex items-center gap-3 font-medium">
                    <Cube size={20} className="text-muted" /> {room.name}
                  </span>
                  <ArrowRight size={18} className="text-muted transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}
