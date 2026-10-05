import Link from "next/link";
import { getStyles } from "@/services/rooms";
import { SITE_NAME } from "@/utils/site";

export async function Footer() {
  const styles = await getStyles();

  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 md:grid-cols-[2fr_1fr_1fr] md:px-8">
        <div className="max-w-sm">
          <p className="text-[17px] font-semibold tracking-tight">{SITE_NAME}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Complete rooms you can explore piece by piece, then buy all at once.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Shop</p>
          <ul className="mt-4 space-y-2.5 text-sm text-muted">
            <li><Link className="hover:text-fg" href="/rooms">All rooms</Link></li>
            <li><Link className="hover:text-fg" href="/catalogue">Catalogue</Link></li>
            <li><Link className="hover:text-fg" href="/cart">Cart</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium">Styles</p>
          <ul className="mt-4 space-y-2.5 text-sm text-muted">
            {styles.map((s) => (
              <li key={s.slug}>
                <Link className="hover:text-fg" href={`/rooms/${s.slug}`}>{s.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] px-4 pb-10 text-xs text-muted md:px-8">
        &copy; {new Date().getFullYear()} {SITE_NAME}
      </div>
    </footer>
  );
}
