import type { ReactNode } from "react";

/** Shared layout for the 404 and error pages: message on the left, an empty room on the stage. */
export function ErrorScreen({
  code,
  title,
  children,
  actions,
  mood = "empty",
}: {
  code: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  /** "flicker": the lamp blinks (something broke). "empty": it sways (nothing here). */
  mood?: "empty" | "flicker";
}) {
  return (
    <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs text-accent">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          {code}
        </p>
        <h1 className="mt-5 max-w-[16ch] text-4xl font-semibold tracking-tighter md:text-6xl">{title}</h1>
        <div className="mt-5 max-w-[48ch] text-lg leading-relaxed text-muted">{children}</div>
        <div className="mt-9 flex flex-wrap gap-2">{actions}</div>
      </div>
      <EmptyRoom mood={mood} />
    </div>
  );
}

/** Line drawing of an empty room with a hanging lamp, in the dark stage style of the 3D rooms. */
function EmptyRoom({ mood }: { mood: "empty" | "flicker" }) {
  const lampClass = mood === "flicker" ? "error-lamp-flicker" : "error-lamp-sway";
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card bg-stage" aria-hidden>
      <div className={`absolute inset-0 ${mood === "flicker" ? "error-glow-flicker" : ""}`}
        style={{ background: "radial-gradient(60% 55% at 50% 52%, rgb(236 122 75 / 0.22), transparent 70%)" }} />
      <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Walls and floor, isometric. */}
        <g stroke="rgb(255 255 255 / 0.22)" strokeWidth="1.2">
          <path d="M200 60 L200 175 M200 175 L80 235 M200 175 L320 235" />
          <path d="M200 60 L80 120 L80 235 M200 60 L320 120 L320 235" />
          <path d="M80 235 L200 290 L320 235" />
        </g>
        {/* Floor boards. */}
        <g stroke="rgb(255 255 255 / 0.07)" strokeWidth="1">
          {[0.2, 0.4, 0.6, 0.8].map((t) => (
            <path key={t} d={`M${200 + 120 * t} ${175 + 60 * t} L${80 + 120 * t} ${235 + 55 * t}`} />
          ))}
        </g>
        {/* Rug outline where a room would be. */}
        <path d="M200 205 L255 232 L200 259 L145 232 Z" stroke="rgb(236 122 75 / 0.35)" strokeDasharray="4 5" strokeWidth="1.2" />
        {/* Picture frame on the left wall, crooked. */}
        <path d="M118 128 L158 108 L158 146 L118 166 Z" stroke="rgb(255 255 255 / 0.18)" strokeWidth="1.2" transform="rotate(-4 138 137)" />
        {/* Hanging lamp. */}
        <g className={lampClass} style={{ transformOrigin: "200px 12px" }}>
          <path d="M200 12 L200 128" stroke="rgb(255 255 255 / 0.35)" strokeWidth="1" />
          <path d="M182 146 Q182 128 200 128 Q218 128 218 146 Z" fill="#1d1f23" stroke="rgb(255 255 255 / 0.4)" strokeWidth="1.2" />
          <ellipse cx="200" cy="147" rx="10" ry="3" fill="#ec7a4b" className="error-bulb" />
        </g>
      </svg>
    </div>
  );
}
