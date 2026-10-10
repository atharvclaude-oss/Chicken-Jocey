"use client";

import { useEffect, useState } from "react";
import { useLoading } from "@/store/loading";
import { Room8Wordmark } from "./Room8Loader";

const MIN_MS = 1700; // from navigation start: the wordmark lands (~1s) and is read
const HOLD_MS = 1000; // and always at least this long after the page is ready
const MAX_MS = 12000; // never trap anyone behind the curtain
const EXIT_MS = 1000;

/**
 * Entry screen on every full page load. Server-rendered visible, so it covers
 * the page from the very first paint; the wordmark animation is pure CSS and
 * starts before hydration. Once the minimum time has passed and no page is
 * holding (see store/loading), the black curtain lifts up and off the screen.
 */
export function IntroCurtain() {
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");

  useEffect(() => {
    let minDone = false;
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      setPhase("leaving");
      setTimeout(() => setPhase("gone"), EXIT_MS);
    };
    const tryLeave = () => {
      if (minDone && useLoading.getState().pending === 0) leave();
    };
    const elapsed = performance.now();
    const tMin = setTimeout(() => {
      minDone = true;
      tryLeave();
    }, Math.max(HOLD_MS, MIN_MS - elapsed));
    const tMax = setTimeout(leave, Math.max(0, MAX_MS - elapsed));
    const unsubscribe = useLoading.subscribe(tryLeave);
    return () => {
      clearTimeout(tMin);
      clearTimeout(tMax);
      unsubscribe();
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <>
      <noscript>
        <style>{"#room8-intro{display:none}"}</style>
      </noscript>
      <div
        id="room8-intro"
        role="status"
        aria-live="polite"
        data-leaving={phase === "leaving" ? "" : undefined}
        className="room8-curtain fixed inset-0 z-[70] grid place-items-center bg-black text-white"
      >
        <span className="sr-only">Loading Room8</span>
        <Room8Wordmark />
      </div>
    </>
  );
}
