import { useId } from "react";
import { SITE_NAME } from "@/utils/site";

/**
 * Room8 mark: two rooms stacked into an "8", joined by a doorway in the shared
 * wall. Drawn in currentColor so it follows whatever surface it sits on.
 */
export function LogoMark({ className = "size-6" }: { className?: string }) {
  const mask = useId();
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        {/* doorway through the shared wall */}
        <rect x="10.25" y="10" width="3.5" height="3" fill="#000" />
      </mask>
      <g mask={`url(#${mask})`} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="9.5" rx="3" />
        <rect x="5" y="11.5" width="14" height="10.5" rx="3" />
      </g>
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="size-[22px]" />
      <span className="text-[17px] font-semibold tracking-[-0.03em]">{SITE_NAME}</span>
    </span>
  );
}
