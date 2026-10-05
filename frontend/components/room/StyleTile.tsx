import Image from "next/image";
import Link from "next/link";
import type { RoomStyle } from "@shared/types";
import { formatPriceWhole } from "@/utils/format";

/** Full-bleed image tile for a room style, used in the homepage bento and /rooms. */
export function StyleTile({
  style,
  fromCents,
  roomCount,
  large = false,
  className = "",
}: {
  style: RoomStyle;
  fromCents?: number;
  roomCount: number;
  large?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/rooms/${style.slug}`}
      className={`group relative block min-h-[260px] overflow-hidden rounded-card bg-stage ${className}`}
    >
      <Image
        src={style.coverImage}
        alt=""
        fill
        sizes={large ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 100vw"}
        className="object-cover transition-transform duration-1000 ease-out-expo group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-white md:p-6">
        <div>
          <h3 className={`font-semibold tracking-tight ${large ? "text-3xl md:text-4xl" : "text-xl md:text-2xl"}`}>
            {style.name}
          </h3>
          {large && <p className="mt-1 max-w-xs text-[15px] text-white/75">{style.tagline}</p>}
        </div>
        <div className="shrink-0 text-right text-sm">
          <p className="text-white/70">{roomCount} rooms</p>
          {fromCents !== undefined && (
            <p className="font-mono tabular-nums">from {formatPriceWhole(fromCents)}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
