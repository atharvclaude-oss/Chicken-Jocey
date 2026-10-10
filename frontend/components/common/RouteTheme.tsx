"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

// Routes that sit on pure black, nav and footer included.
const DARK = [/^\/$/, /^\/catalogue/, /^\/rooms\//];

export function RouteTheme({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const dark = DARK.some((r) => r.test(pathname));
  return <div className={`flex min-h-full flex-1 flex-col ${dark ? "theme-dark" : ""}`}>{children}</div>;
}
