"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during SSR and the first client render, true afterwards. Anything
 * rendered from browser-only state (the persisted cart) should wait for this
 * to avoid a hydration mismatch.
 */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
