import { SITE_NAME } from "@/utils/site";

/**
 * The one loading screen used across Room8: black panel, white wordmark rising
 * from below a mask line, a thin light sweeping underneath.
 *
 * - fixed: covers the viewport (route loads); otherwise fills its parent (3D stage)
 * - delayMs: stay invisible this long first, so fast loads never flash black
 * - progress: 0..100 shows a real progress line instead of the sweep
 */
export function Room8Loader({
  fixed = false,
  delayMs = 0,
  progress,
}: {
  fixed?: boolean;
  delayMs?: number;
  progress?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-delay={delayMs ? "" : undefined}
      style={delayMs ? ({ "--room8-delay": `${delayMs}ms` } as React.CSSProperties) : undefined}
      className={`room8-loader ${fixed ? "fixed inset-0 z-[60]" : "absolute inset-0 z-20"} grid place-items-center bg-black text-white`}
    >
      <span className="sr-only">Loading</span>
      <Room8Wordmark />
      <div className="absolute bottom-[18%] left-1/2 h-px w-40 -translate-x-1/2 overflow-hidden bg-white/12">
        {progress === undefined ? (
          <div className="room8-sweep h-full w-1/3 bg-white/70" />
        ) : (
          <div className="h-full bg-white/80 transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
        )}
      </div>
    </div>
  );
}

export function Room8Wordmark() {
  return (
    <div aria-hidden="true" className="room8-word-wrap overflow-hidden pb-[0.08em]">
      <p className="room8-word text-[clamp(3.5rem,13vw,6rem)] font-semibold leading-none tracking-[-0.04em]">{SITE_NAME}</p>
    </div>
  );
}
