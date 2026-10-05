"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Honors prefers-reduced-motion for every Motion animation in the app:
 * transform animations are skipped, opacity fades still run. Components should
 * not branch their `initial` state on useReducedMotion(), since that differs
 * between server and client and causes hydration mismatches.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
