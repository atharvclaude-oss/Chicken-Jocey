import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import type { RoomSummary } from "@shared/types";
import { formatPriceWhole, pluralize } from "@/utils/format";

export function RoomCard({
  room,
  featured = false,
  preload = false,
}: {
  room: RoomSummary;
  featured?: boolean;
  preload?: boolean;
}) {
  return (
    <Link href={`/rooms/${room.styleSlug}/${room.slug}`} className="group block">
      <div
        className={`relative overflow-hidden rounded-card bg-sunken ${
          featured ? "aspect-[4/3] md:aspect-[21/9]" : "aspect-[4/3]"
        }`}
      >
        <Image
          src={room.image}
          alt={room.name}
          fill
          preload={preload}
          sizes={featured ? "(min-width: 768px) 66vw, 100vw" : "(min-width: 768px) 33vw, 100vw"}
          className="object-cover transition-transform duration-700 ease-out-expo group-hover:scale-[1.03]"
        />
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h3 className={`font-semibold tracking-tight ${featured ? "text-2xl md:text-3xl" : "text-xl"}`}>
            {room.name}
          </h3>
          <p className="mt-1 text-sm text-muted">{room.blurb}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg tabular-nums">{formatPriceWhole(room.totalCents)}</p>
          <p className="text-xs text-muted">complete, {pluralize(room.productCount, "piece")}</p>
        </div>
      </div>
      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium">
        Explore room
        <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
      </span>
    </Link>
  );
}
