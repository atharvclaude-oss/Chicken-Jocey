import Image from "next/image";
import Link from "next/link";

/**
 * A catalogue box: a photo with its name bottom-left, set like the room titles.
 * Without an href it renders an empty placeholder box (departments still to come).
 */
export function CatalogueTile({
  href,
  image,
  label,
  sizes = "(min-width: 1400px) 700px, 50vw",
  preload = false,
}: {
  href?: string;
  image?: string;
  label?: string;
  sizes?: string;
  preload?: boolean;
}) {
  if (!href || !image || !label) {
    return <div aria-hidden className="aspect-[4/5] rounded-card border border-line/70 bg-surface/50" />;
  }
  return (
    <Link
      href={href}
      className="group relative block aspect-[4/5] overflow-hidden rounded-card bg-sunken outline-offset-4"
    >
      <Image
        src={image}
        alt=""
        fill
        preload={preload}
        sizes={sizes}
        className="object-cover transition-transform duration-1000 ease-out-expo group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <span
        className="absolute inset-x-4 bottom-4 text-balance text-2xl font-semibold leading-tight tracking-[-0.035em] text-white sm:inset-x-6 sm:bottom-6 sm:text-4xl md:text-5xl lg:text-6xl"
      >
        {label}
      </span>
    </Link>
  );
}
