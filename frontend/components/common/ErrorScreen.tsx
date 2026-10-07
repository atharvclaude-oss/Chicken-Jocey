import type { ReactNode } from "react";

/** Shared layout for the 404 and error pages, so both feel like the rest of the site. */
export function ErrorScreen({
  code,
  title,
  children,
  actions,
}: {
  code: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col items-start px-4 py-24 md:px-8 md:py-32">
      <p className="font-mono text-sm text-accent">{code}</p>
      <h1 className="mt-3 max-w-[18ch] text-4xl font-semibold tracking-tighter md:text-6xl">{title}</h1>
      <div className="mt-4 max-w-[52ch] text-lg text-muted">{children}</div>
      <div className="mt-8 flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
