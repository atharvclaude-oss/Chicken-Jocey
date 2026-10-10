import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { SITE_NAME } from "@/utils/site";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 md:grid-cols-[2fr_1fr] md:px-8">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Real rooms you can walk through, and every piece in them to shop.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Shop</p>
          <ul className="mt-4 space-y-2.5 text-sm text-muted">
            <li><Link className="hover:text-fg" href="/">Rooms</Link></li>
            <li><Link className="hover:text-fg" href="/catalogue">Catalogue</Link></li>
            <li><Link className="hover:text-fg" href="/cart">Cart</Link></li>
            <li><Link className="hover:text-fg" href="/credits">Credits</Link></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] px-4 pb-10 text-xs text-muted md:px-8">
        &copy; {new Date().getFullYear()} {SITE_NAME}
      </div>
    </footer>
  );
}
