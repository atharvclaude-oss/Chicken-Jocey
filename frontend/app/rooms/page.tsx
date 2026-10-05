import type { Metadata } from "next";
import { Reveal } from "@/components/common/Reveal";
import { StyleTile } from "@/components/room/StyleTile";
import { getRooms, getStyles, getStyleStartingPrices } from "@/services/rooms";

export const metadata: Metadata = {
  title: "Rooms",
  description: "Browse complete designer rooms by style.",
};

// 6-column grid: two wide tiles on top, three below. Matches the 5 styles exactly.
const spans = ["md:col-span-3", "md:col-span-3", "md:col-span-2", "md:col-span-2", "md:col-span-2"];

export default async function RoomsPage() {
  const [styles, rooms, fromPrices] = await Promise.all([getStyles(), getRooms(), getStyleStartingPrices()]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-12 md:px-8 md:pt-16">
      <Reveal>
        <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">Choose a style</h1>
        <p className="mt-4 max-w-[50ch] text-lg text-muted">
          Each style has a few complete rooms. Open one to explore it piece by piece.
        </p>
      </Reveal>
      <div className="mt-12 grid gap-3 md:grid-cols-6 md:gap-4">
        {styles.map((style, i) => (
          <Reveal key={style.slug} delay={0.06 * i} className={spans[i] ?? "md:col-span-2"}>
            <StyleTile
              style={style}
              large={i < 2}
              roomCount={rooms.filter((r) => r.styleSlug === style.slug).length}
              fromCents={fromPrices[style.slug]}
              className={i < 2 ? "aspect-[4/3] md:aspect-[16/11]" : "aspect-[4/3]"}
            />
          </Reveal>
        ))}
      </div>
    </div>
  );
}
