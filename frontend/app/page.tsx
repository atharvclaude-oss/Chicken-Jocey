import Image from "next/image";
import { ButtonLink } from "@/components/common/Button";
import { Reveal } from "@/components/common/Reveal";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { HeroShowcase } from "@/components/room/HeroShowcase";
import { StyleTile } from "@/components/room/StyleTile";
import { getProductsByIds } from "@/services/products";
import { getRooms, getStyles, getStyleStartingPrices } from "@/services/rooms";

const steps = [
  { verb: "Pick a room", body: "Start from a finished room in a style you like, priced as a complete set." },
  { verb: "Click anything", body: "Every lamp, rug and print in the room opens with its price and details." },
  { verb: "Keep what you want", body: "Buy the whole room, or untick the pieces you already own." },
];

const railIds = [
  "mushroom-lamp", "arc-floor-lamp", "woven-wool-rug", "banker-lamp",
  "cloud-lounge-chair", "walnut-keyboard", "oak-gallery-frame", "edison-globe-lamp",
];

export default async function HomePage() {
  const [styles, rooms, fromPrices, rail, heroProducts] = await Promise.all([
    getStyles(),
    getRooms(),
    getStyleStartingPrices(),
    getProductsByIds(railIds),
    getProductsByIds(["linen-throw-pillow", "swing-arm-desk-lamp"]),
  ]);
  const roomCount = (slug: string) => rooms.filter((r) => r.styleSlug === slug).length;
  const [first, ...rest] = styles;

  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 pb-16 pt-10 md:px-8 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:py-12">
        <Reveal>
          <h1 className="text-[44px] font-semibold leading-[1.02] tracking-tighter md:text-6xl lg:text-[68px]">
            Shop the room, not just the product.
          </h1>
          <p className="mt-6 max-w-[42ch] text-lg leading-relaxed text-muted">
            Pick a room you love, explore every corner, and buy all of it or just the lamp.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink href="/rooms" size="lg">Browse rooms</ButtonLink>
            <ButtonLink href="/catalogue" size="lg" variant="secondary">Shop catalogue</ButtonLink>
          </div>
        </Reveal>
        <HeroShowcase
          image="/images/rooms/hero.jpg"
          spots={[
            { product: heroProducts[0], x: 51, y: 52 },
            { product: heroProducts[1], x: 60, y: 36 },
          ]}
        />
      </section>

      {/* Styles bento: exactly one tile per style */}
      <section className="mx-auto max-w-[1400px] px-4 py-20 md:px-8 md:py-28">
        <Reveal>
          <h2 className="max-w-xl text-3xl font-semibold tracking-tight md:text-5xl">Start with a style</h2>
          <p className="mt-4 max-w-[52ch] text-muted">
            Five looks, a few complete rooms each. Every room is priced as a full set.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-3 md:grid-cols-4 md:grid-rows-[300px_300px] md:gap-4">
          <Reveal className="md:col-span-2 md:row-span-2">
            <StyleTile
              style={first}
              large
              roomCount={roomCount(first.slug)}
              fromCents={fromPrices[first.slug]}
              className="h-full min-h-[380px]"
            />
          </Reveal>
          {rest.map((s, i) => (
            <Reveal key={s.slug} delay={0.08 * (i + 1)}>
              <StyleTile style={s} roomCount={roomCount(s.slug)} fromCents={fromPrices[s.slug]} className="h-full" />
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-20 md:px-8 md:py-28 lg:grid-cols-2 lg:gap-20">
          <Reveal className="lg:sticky lg:top-24 lg:self-start">
            <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-sunken">
              <Image
                src="/images/rooms/urban-black.jpg"
                alt="A black bed with a yellow pillow, line-art prints and a brass wall lamp"
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          </Reveal>
          <div>
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">A store you walk through</h2>
            </Reveal>
            <ol className="mt-10 divide-y divide-line border-t border-line">
              {steps.map((step, i) => (
                <Reveal
                  key={step.verb}
                  as="li"
                  delay={0.08 * i}
                  className="grid gap-2 py-8 md:grid-cols-[220px_1fr] md:gap-8"
                >
                  <h3 className="text-xl font-semibold tracking-tight md:text-2xl">{step.verb}</h3>
                  <p className="max-w-[44ch] leading-relaxed text-muted">{step.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Product rail */}
      <section className="py-20 md:py-28">
        <div className="mx-auto flex max-w-[1400px] items-end justify-between gap-6 px-4 md:px-8">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Every piece sells on its own</h2>
          </Reveal>
          <div className="hidden shrink-0 md:block">
            <ButtonLink href="/catalogue" variant="ghost">Shop catalogue</ButtonLink>
          </div>
        </div>
        <div className="no-scrollbar rail-gutter mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto">
          {rail.map((product) => (
            <div key={product.id} className="w-[62vw] shrink-0 snap-start sm:w-[38vw] md:w-[280px]">
              <ProductCard product={product} sizes="280px" />
            </div>
          ))}
        </div>
      </section>

      {/* Closing */}
      <section className="mx-auto max-w-[1400px] px-4 pb-24 md:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-card bg-stage">
            <Image
              src="/images/rooms/golden-hour.jpg"
              alt=""
              fill
              sizes="100vw"
              className="object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
            <div className="relative max-w-xl px-6 py-20 text-white md:px-14 md:py-28">
              <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">The hard part is already done.</h2>
              <p className="mt-4 max-w-[40ch] text-white/80">
                Every room is styled, measured and priced. You just choose.
              </p>
              <ButtonLink href="/rooms" size="lg" variant="onImage" className="mt-8">
                Browse rooms
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
