"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bag } from "@phosphor-icons/react";
import { useCart, lineCount } from "@/store/cart";
import { useHydrated } from "@/hooks/useHydrated";
import { SITE_NAME } from "@/utils/site";

const links = [
  { href: "/rooms", label: "Rooms" },
  { href: "/catalogue", label: "Catalogue" },
];

export function Navbar() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const count = useCart((s) => s.items.reduce((n, i) => n + lineCount(i), 0));

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 md:px-8">
        <Link href="/" className="text-[17px] font-semibold tracking-tight">
          {SITE_NAME}
        </Link>

        <div className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3.5 py-2 text-sm transition-colors ${
                  active ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/cart"
            aria-label={`Cart, ${hydrated ? count : 0} items`}
            className="relative ml-1 grid size-10 place-items-center rounded-full transition-colors hover:bg-sunken"
          >
            <Bag size={20} weight="regular" />
            {hydrated && count > 0 && (
              <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 font-mono text-[10px] font-medium text-accent-fg">
                {count}
              </span>
            )}
          </Link>
        </div>
      </nav>
    </header>
  );
}
